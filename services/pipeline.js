const { RiskZone, RiskPrediction, AuditLog } = require('../db/models');
const { calculateRisk } = require('./riskEngine');
const { computeImpact } = require('./impactEngine');
const { decide, createAlert } = require('./decisionEngine');
const { sendAlertPush } = require('./pushService');

let io = null;
function attachIO(socketIoInstance) {
  io = socketIoInstance;
}

async function audit(action, entity, details, userId = null) {
  try {
    await AuditLog.create({ user_id: userId || null, action, entity, details });
  } catch (e) {
    console.error('[Audit] failed to write log:', e.message);
  }
}

// The CORE closed loop:
// DATA CHANGE -> FEATURE/RISK RECALC -> IMPACT -> DECISION -> ALERT -> PUSH -> BROADCAST
async function runPipeline(zoneId, { triggeredBy = 'SYSTEM', reason = 'data update' } = {}) {
  const prev = await RiskPrediction.findOne({ risk_zone_id: zoneId }).sort({ created_at: -1 });
  const prevLevel = prev ? prev.risk_level : null;

  const prediction = await calculateRisk(zoneId);
  const impact = await computeImpact(zoneId, prediction.riskLevel);
  const decision = decide({ riskLevel: prediction.riskLevel, confidence: prediction.confidence, impact });

  const levelChanged = prevLevel !== prediction.riskLevel;
  let alert = null;
  let pushResult = null;

  if (decision.alertLevel !== 'INFO' || levelChanged) {
    const zone = await RiskZone.findById(zoneId);
    alert = await createAlert({
      zoneId,
      level: decision.alertLevel,
      title: `${prediction.riskLevel} risk in ${zone.name}`,
      description: `Risk score ${prediction.finalScore}/100 (confidence ${prediction.confidence}%). Triggered by: ${reason}.`,
      action: decision.action
    });

    // Real push notification for anything WARNING or above — this is what
    // actually lands on a real phone's lock screen.
    if (['WARNING', 'HIGH ALERT', 'EMERGENCY'].includes(decision.alertLevel)) {
      try {
        pushResult = await sendAlertPush(zoneId, {
          title: `${decision.alertLevel}: ${zone.name}`,
          body: `${prediction.riskLevel} risk (score ${prediction.finalScore}/100). ${decision.action}`,
          level: decision.alertLevel,
          zoneName: zone.name
        });
      } catch (e) {
        console.error('[Push] send failed:', e.message);
      }
    }
  }

  await audit('RISK_RECALCULATED', 'risk_zone', {
    zoneId: zoneId.toString(), riskLevel: prediction.riskLevel, score: prediction.finalScore,
    confidence: prediction.confidence, reason, triggeredBy
  });

  const payload = {
    zoneId: zoneId.toString(),
    prediction,
    impact,
    decision,
    alert,
    pushResult,
    levelChanged,
    previousLevel: prevLevel,
    reason,
    triggeredBy,
    timestamp: new Date().toISOString()
  };

  if (io) {
    io.emit('risk:update', payload);
    if (alert) io.emit('alert:new', alert);
  }

  return payload;
}

module.exports = { runPipeline, attachIO, audit };
