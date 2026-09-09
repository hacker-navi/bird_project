const express = require('express');
const { User, AgentAssignment, RiskZone, FieldReport, CitizenReport } = require('../db/models');
const { runPipeline, audit } = require('../services/pipeline');
const { analyzeIncidentImage } = require('../services/imageAnalysis');
const router = express.Router();

router.get('/agents', async (req, res) => {
  const agents = await User.find({ role: 'FIELD_AGENT' }).select('name email phone agent_status');
  res.json(agents.map(a => a.toJSON()));
});

router.post('/agent-assignments', async (req, res) => {
  const { risk_zone_id, agent_id, citizen_report_id, priority = 'HIGH' } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  let assignedAgent = agent_id;
  if (!assignedAgent) {
    const available = await User.findOne({ role: 'FIELD_AGENT', agent_status: 'AVAILABLE' });
    assignedAgent = available ? available._id : (await User.findOne({ role: 'FIELD_AGENT' }))?._id;
  }
  if (!assignedAgent) return res.status(400).json({ error: 'No field agents available' });

  const assignment = await AgentAssignment.create({
    risk_zone_id, agent_id: assignedAgent, citizen_report_id: citizen_report_id || null, priority, status: 'ASSIGNED'
  });
  await User.findByIdAndUpdate(assignedAgent, { agent_status: 'ASSIGNED' });

  await audit('AGENT_ASSIGNED', 'agent_assignment', { id: assignment._id.toString(), risk_zone_id, agent_id: assignedAgent });
  res.status(201).json(assignment.toJSON());
});

router.get('/agent-assignments', async (req, res) => {
  const { agent_id, status } = req.query;
  const q = {};
  if (agent_id) q.agent_id = agent_id;
  if (status) q.status = status;

  const rows = await AgentAssignment.find(q).sort({ created_at: -1 }).limit(100);
  const zoneIds = [...new Set(rows.map(r => r.risk_zone_id.toString()))];
  const zones = await RiskZone.find({ _id: { $in: zoneIds } });
  const zoneMap = Object.fromEntries(zones.map(z => [z._id.toString(), z]));

  // For each assignment, also fetch the linked citizen report (without base64)
  const reportIds = rows.filter(r => r.citizen_report_id).map(r => r.citizen_report_id);
  const reports = reportIds.length ? await CitizenReport.find({ _id: { $in: reportIds } }).select('-photo_base64') : [];
  const reportMap = Object.fromEntries(reports.map(r => [r._id.toString(), r.toJSON()]));

  res.json(rows.map(r => {
    const z = zoneMap[r.risk_zone_id.toString()];
    return {
      ...r.toJSON(),
      zone_name: z?.name, zone_code: z?.code, latitude: z?.latitude, longitude: z?.longitude,
      citizen_report: r.citizen_report_id ? reportMap[r.citizen_report_id.toString()] : null
    };
  }));
});

const STATUS_TO_AGENT_STATUS = {
  ACCEPTED: 'ASSIGNED', EN_ROUTE: 'EN ROUTE', ON_SITE: 'ON SITE', COMPLETED: 'AVAILABLE'
};

router.patch('/agent-assignments/:id', async (req, res) => {
  const { status } = req.body;
  const valid = ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED'];
  if (!valid.includes(status)) return res.status(400).json({ error: `status must be one of ${valid.join(', ')}` });

  const assignment = await AgentAssignment.findById(req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  assignment.status = status;
  assignment.updated_at = new Date();
  await assignment.save();

  if (STATUS_TO_AGENT_STATUS[status]) {
    await User.findByIdAndUpdate(assignment.agent_id, { agent_status: STATUS_TO_AGENT_STATUS[status] });
  }
  await audit('AGENT_ASSIGNMENT_UPDATED', 'agent_assignment', { id: req.params.id, status });
  res.json(assignment.toJSON());
});

// Field verification — NOW with real photo + GPS + AI analysis
router.post('/field-reports', async (req, res) => {
  const {
    assignment_id, risk_zone_id, agent_id,
    notes, verification_result,
    photo_base64, photo_mime, photo_note,
    agent_gps // { lat, lng, accuracy }
  } = req.body;

  if (!risk_zone_id || !verification_result) {
    return res.status(400).json({ error: 'risk_zone_id and verification_result required' });
  }

  // AI Vision Analysis of agent's field photo
  let imageAnalysis = null;
  if (photo_base64) {
    // For field verification, map verification_result to incident type for AI check
    const typeMap = {
      CONFIRMED: 'Landslide',
      PARTIAL: 'Ground Crack',
      FALSE_ALARM: 'Other Hazard'
    };
    const expectedType = typeMap[verification_result] || 'Other Hazard';
    imageAnalysis = await analyzeIncidentImage(photo_base64, expectedType, photo_mime || 'image/jpeg');
  }

  let aiPhotoNote = photo_note || null;
  if (photo_base64 && imageAnalysis) {
    aiPhotoNote = imageAnalysis.match
      ? `✅ AI: Field photo confirms hazard (confidence ${imageAnalysis.confidence}%): ${imageAnalysis.ai_description}`
      : imageAnalysis.skipped
        ? '📷 Field photo uploaded — AI analysis pending'
        : `⚠ AI: Field photo analyzed (confidence ${imageAnalysis.confidence}%): ${imageAnalysis.ai_description}`;
  }

  const fieldReport = await FieldReport.create({
    assignment_id: assignment_id || null,
    risk_zone_id,
    agent_id: agent_id || null,
    notes: notes || '',
    verification_result,
    photo_base64: photo_base64 || null,
    photo_mime: photo_mime || 'image/jpeg',
    photo_note: aiPhotoNote,
    agent_gps: agent_gps || null,
    image_analysis: imageAnalysis || undefined
  });

  if (assignment_id) {
    const assignment = await AgentAssignment.findById(assignment_id);
    if (assignment) {
      assignment.status = 'COMPLETED';
      assignment.updated_at = new Date();
      await assignment.save();
      await User.findByIdAndUpdate(assignment.agent_id, { agent_status: 'AVAILABLE' });

      if (assignment.citizen_report_id) {
        const newStatus = verification_result === 'CONFIRMED' ? 'VERIFIED'
          : verification_result === 'FALSE_ALARM' ? 'REJECTED' : 'UNDER REVIEW';
        await CitizenReport.findByIdAndUpdate(assignment.citizen_report_id, { status: newStatus });
      }
    }
  }

  await audit('FIELD_REPORT_SUBMITTED', 'field_report', {
    id: fieldReport._id.toString(), risk_zone_id, verification_result,
    has_photo: !!photo_base64, has_gps: !!agent_gps,
    image_match: imageAnalysis?.match, image_confidence: imageAnalysis?.confidence
  });

  const pipeline = await runPipeline(risk_zone_id, {
    triggeredBy: 'FIELD_AGENT',
    reason: `Field verification: ${verification_result}${imageAnalysis?.match ? ' [PHOTO CONFIRMED]' : ''}`
  });

  const reportOut = fieldReport.toJSON();
  delete reportOut.photo_base64;

  res.status(201).json({ fieldReport: reportOut, imageAnalysis, pipeline });
});

// Serve field report photo
router.get('/field-reports/:id/photo', async (req, res) => {
  const report = await FieldReport.findById(req.params.id).select('photo_base64 photo_mime');
  if (!report || !report.photo_base64) return res.status(404).json({ error: 'No photo' });
  const buf = Buffer.from(report.photo_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  res.set('Content-Type', report.photo_mime || 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(buf);
});

router.get('/field-reports', async (req, res) => {
  const { risk_zone_id } = req.query;
  const q = risk_zone_id ? { risk_zone_id } : {};
  const rows = await FieldReport.find(q).sort({ created_at: -1 }).limit(risk_zone_id ? 1000 : 100).select('-photo_base64');
  res.json(rows.map(r => r.toJSON()));
});

module.exports = router;
