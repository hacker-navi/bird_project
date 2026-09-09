/**
 * escalationJob.js
 * Cron-driven background jobs:
 *  1. Auto-escalation: If a zone has been HIGH or CRITICAL for 2+ hours with no
 *     active agent assignment, automatically assign the nearest available agent
 *     and create an EMERGENCY alert.
 *  2. Predictive rainfall alert: If 3 consecutive rainfall readings are increasing
 *     and the latest exceeds 100mm, emit a predictive HIGH risk warning.
 *  3. Live weather refresh: Pull fresh OWM data every 30 minutes.
 */

const cron = require('node-cron');
const { RiskZone, RiskPrediction, AgentAssignment, User, WeatherData } = require('../db/models');
const { runPipeline } = require('./pipeline');
const { refreshAllZoneWeather } = require('./weatherFetcher');

let ioRef = null;
function attachIO(io) { ioRef = io; }

// ─── AUTO-ESCALATION ───────────────────────────────────────────────────────────
async function checkEscalations() {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  // Find zones that have been HIGH/CRITICAL since at least 2h ago
  const staleHighPredictions = await RiskPrediction.aggregate([
    { $match: { risk_level: { $in: ['HIGH', 'CRITICAL'] }, created_at: { $lte: twoHoursAgo } } },
    { $sort: { created_at: -1 } },
    { $group: { _id: '$risk_zone_id', latestLevel: { $first: '$risk_level' }, latestAt: { $first: '$created_at' } } }
  ]);

  for (const row of staleHighPredictions) {
    // Verify still HIGH/CRITICAL (latest prediction)
    const latest = await RiskPrediction.findOne({ risk_zone_id: row._id }).sort({ created_at: -1 });
    if (!latest || !['HIGH', 'CRITICAL'].includes(latest.risk_level)) continue;

    // Check if there is already an active (non-completed) assignment for this zone
    const existingAssignment = await AgentAssignment.findOne({ risk_zone_id: row._id, status: { $ne: 'COMPLETED' } });
    if (existingAssignment) continue;

    // Auto-assign an available agent
    const agent = await User.findOne({ role: 'FIELD_AGENT', agent_status: 'AVAILABLE' });
    if (!agent) continue;

    const assignment = await AgentAssignment.create({
      risk_zone_id: row._id, agent_id: agent._id,
      priority: latest.risk_level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      status: 'ASSIGNED'
    });
    await User.findByIdAndUpdate(agent._id, { agent_status: 'ASSIGNED' });

    const zone = await RiskZone.findById(row._id);
    console.log(`[Escalation] Auto-assigned ${agent.name} to ${zone?.name} (${latest.risk_level} for 2h+)`);

    if (ioRef) {
      ioRef.emit('auto:escalation', {
        zoneId: row._id.toString(),
        zoneName: zone?.name,
        riskLevel: latest.risk_level,
        agentName: agent.name,
        assignmentId: assignment._id.toString(),
        reason: `Zone has been ${latest.risk_level} for 2+ hours with no field response`
      });
    }
  }
}

// ─── PREDICTIVE ALERT ──────────────────────────────────────────────────────────
async function checkPredictiveAlerts() {
  const zones = await RiskZone.find().select('_id name');

  for (const zone of zones) {
    const recent = await WeatherData.find({ risk_zone_id: zone._id })
      .sort({ timestamp: -1 }).limit(5).select('rainfall_24h timestamp source');

    if (recent.length < 3) continue;

    const values = recent.map(r => r.rainfall_24h).reverse(); // oldest first
    const isIncreasing = values.every((v, i) => i === 0 || v > values[i - 1]);
    const latest = values[values.length - 1];
    const rate = values.length > 1 ? (values[values.length - 1] - values[0]) / (values.length - 1) : 0;

    if (isIncreasing && latest > 80 && rate > 10) {
      // Predict future value in 3 hours (3 more readings at same rate)
      const predicted3h = Math.round(latest + rate * 3);
      const willExceedHigh = predicted3h > 140;

      if (willExceedHigh && ioRef) {
        ioRef.emit('predictive:alert', {
          zoneId: zone._id.toString(),
          zoneName: zone.name,
          currentRainfall: latest,
          predictedRainfall3h: predicted3h,
          trend: 'RISING',
          message: `Rainfall trend suggests ${predicted3h}mm in 3 hours — HIGH risk threshold may be breached`,
          timestamp: new Date().toISOString()
        });
      }
    }
  }
}

// ─── REPORT CLUSTER CHECK ─────────────────────────────────────────────────────
// If 3+ citizen reports in the same zone in last 30 minutes, emit a cluster event
async function checkReportClusters() {
  const { CitizenReport } = require('../db/models');
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const clusters = await CitizenReport.aggregate([
    { $match: { created_at: { $gte: thirtyMinAgo }, status: { $ne: 'REJECTED' } } },
    { $group: { _id: '$risk_zone_id', count: { $sum: 1 }, types: { $addToSet: '$incident_type' } } },
    { $match: { count: { $gte: 3 } } }
  ]);

  for (const cluster of clusters) {
    const zone = await RiskZone.findById(cluster._id).select('name');
    if (ioRef) {
      ioRef.emit('report:cluster', {
        zoneId: cluster._id.toString(),
        zoneName: zone?.name,
        reportCount: cluster.count,
        incidentTypes: cluster.types,
        message: `${cluster.count} reports in 30 min from ${zone?.name} — possible active event`,
        timestamp: new Date().toISOString()
      });
    }
    // Trigger risk recalculation for clustered zone
    try {
      await runPipeline(cluster._id, { triggeredBy: 'CLUSTER_DETECTOR', reason: `${cluster.count} citizen reports clustered in 30min` });
    } catch (e) { /* non-blocking */ }
  }
}

// ─── SCHEDULER BOOT ───────────────────────────────────────────────────────────
function startJobs() {
  // Auto-escalation: every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try { await checkEscalations(); } catch (e) { console.error('[Escalation job] error:', e.message); }
  });

  // Predictive alerts: every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try { await checkPredictiveAlerts(); } catch (e) { console.error('[Predictive job] error:', e.message); }
  });

  // Report cluster check: every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try { await checkReportClusters(); } catch (e) { console.error('[Cluster job] error:', e.message); }
  });

  // Live weather refresh: every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await refreshAllZoneWeather();
      if (!result.skipped) console.log(`[Weather] Refreshed: ${result.updated} zones updated, ${result.failed} failed`);
    } catch (e) { console.error('[Weather job] error:', e.message); }
  });

  console.log('[Jobs] Escalation, predictive, cluster, and weather jobs scheduled.');
}

module.exports = { startJobs, attachIO, checkEscalations, checkPredictiveAlerts };
