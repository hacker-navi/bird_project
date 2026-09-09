const express = require('express');
const { CitizenReport, RiskZone } = require('../db/models');
const { runPipeline, audit } = require('../services/pipeline');
const { analyzeIncidentImage, analyzeTextDescription } = require('../services/imageAnalysis');
const router = express.Router();

const VALID_TYPES = ['Road Crack', 'Ground Crack', 'Rock Fall', 'Mud Movement', 'Landslide', 'Flooding', 'Blocked Road', 'Other Hazard'];

router.post('/citizen-reports', async (req, res) => {
  const {
    risk_zone_id, user_id, incident_type, description,
    latitude, longitude, gps_accuracy,
    photo_base64, photo_mime,
    photo_note, offline_captured
  } = req.body;

  if (!risk_zone_id || !incident_type) return res.status(400).json({ error: 'risk_zone_id and incident_type required' });
  if (!VALID_TYPES.includes(incident_type)) return res.status(400).json({ error: `incident_type must be one of ${VALID_TYPES.join(', ')}` });

  // Duplicate check: same zone + same type in last 10 minutes
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const dup = await CitizenReport.findOne({ risk_zone_id, incident_type, created_at: { $gt: tenMinAgo } }).sort({ created_at: -1 });

  // ─── AI Analysis (run in parallel) ─────────────────────────────────────────
  const [imageAnalysis, textAnalysis] = await Promise.all([
    photo_base64
      ? analyzeIncidentImage(photo_base64, incident_type, photo_mime || 'image/jpeg')
      : Promise.resolve(null),
    description && description.trim().length > 5
      ? analyzeTextDescription(description, incident_type)
      : Promise.resolve({ severity_score: 0, keywords_found: [], ai_enhanced: false })
  ]);

  // Build photo_note that summarizes AI result
  let aiPhotoNote = photo_note || null;
  if (photo_base64 && imageAnalysis) {
    aiPhotoNote = imageAnalysis.match
      ? `✅ AI: Image matches ${incident_type} (confidence ${imageAnalysis.confidence}%)`
      : imageAnalysis.skipped
        ? '📷 Photo uploaded — AI analysis pending'
        : `⚠ AI: Image does not clearly match ${incident_type} (confidence ${imageAnalysis.confidence}%)`;
  }

  const report = await CitizenReport.create({
    risk_zone_id, user_id: user_id || null, incident_type,
    description: description || '',
    latitude: latitude || null,
    longitude: longitude || null,
    gps_accuracy: gps_accuracy || null,
    photo_base64: photo_base64 || null,
    photo_mime: photo_mime || 'image/jpeg',
    photo_note: aiPhotoNote,
    image_analysis: imageAnalysis || undefined,
    text_analysis: textAnalysis || {},
    status: dup ? 'UNDER REVIEW' : 'NEW',
    sync_status: 'SYNCED'
  });

  await audit('CITIZEN_REPORT_SUBMITTED', 'citizen_report', {
    id: report._id.toString(), incident_type, risk_zone_id,
    has_photo: !!photo_base64, has_gps: !!(latitude && longitude),
    image_match: imageAnalysis?.match, image_confidence: imageAnalysis?.confidence
  }, user_id);

  const pipeline = await runPipeline(risk_zone_id, {
    triggeredBy: 'CITIZEN_REPORT',
    reason: `Citizen reported: ${incident_type}${imageAnalysis?.match ? ' [IMAGE VERIFIED]' : ''}${latitude ? ' [GPS]' : ''}`
  });

  // Return WITHOUT the full base64 to keep response size small
  const reportOut = report.toJSON();
  delete reportOut.photo_base64;

  res.status(201).json({
    report: reportOut,
    possibleDuplicate: !!dup,
    imageAnalysis,
    textAnalysis,
    pipeline
  });
});

router.get('/citizen-reports', async (req, res) => {
  const { risk_zone_id, status, user_id } = req.query;
  const q = {};
  if (risk_zone_id) q.risk_zone_id = risk_zone_id;
  if (status) q.status = status;
  if (user_id) q.user_id = user_id;
  // Never return raw base64 in list — too large
  const rows = await CitizenReport.find(q).sort({ created_at: -1 }).limit(200).select('-photo_base64');
  res.json(rows.map(r => r.toJSON()));
});

router.get('/citizen-reports/:id', async (req, res) => {
  const report = await CitizenReport.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  const zone = await RiskZone.findById(report.risk_zone_id);
  const out = report.toJSON();
  // Include base64 only in single-record fetch (for preview in agent/dashboard)
  res.json({ ...out, zone: zone ? zone.toJSON() : null });
});

// Return thumbnail-only (strip base64 from list but expose for single record)
router.get('/citizen-reports/:id/photo', async (req, res) => {
  const report = await CitizenReport.findById(req.params.id).select('photo_base64 photo_mime');
  if (!report || !report.photo_base64) return res.status(404).json({ error: 'No photo' });
  // Serve as image
  const buf = Buffer.from(report.photo_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  res.set('Content-Type', report.photo_mime || 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(buf);
});

router.patch('/citizen-reports/:id', async (req, res) => {
  const { status } = req.body;
  const valid = ['NEW', 'UNDER REVIEW', 'VERIFIED', 'REJECTED', 'RESOLVED'];
  if (!valid.includes(status)) return res.status(400).json({ error: `status must be one of ${valid.join(', ')}` });

  const report = await CitizenReport.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  report.status = status;
  await report.save();
  await audit('CITIZEN_REPORT_STATUS_UPDATED', 'citizen_report', { id: req.params.id, status });

  const pipeline = await runPipeline(report.risk_zone_id, { triggeredBy: 'GOVERNMENT_REVIEW', reason: `Report ${status.toLowerCase()}` });
  const out = report.toJSON();
  delete out.photo_base64;
  res.json({ report: out, pipeline });
});

module.exports = router;
