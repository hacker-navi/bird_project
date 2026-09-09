const { Alert } = require('../db/models');

function decide({ riskLevel, confidence, impact }) {
  let action, alertLevel, requiresAgent = false, escalate = false;

  switch (riskLevel) {
    case 'LOW':
      action = 'Continue Monitoring';
      alertLevel = 'INFO';
      break;
    case 'MEDIUM':
      action = 'Increase Monitoring Frequency';
      alertLevel = 'WATCH';
      break;
    case 'HIGH':
      action = 'Issue Warning; Request Field Verification; Monitor Continuously';
      alertLevel = 'WARNING';
      requiresAgent = confidence < 85;
      break;
    case 'CRITICAL':
      action = 'Emergency Alert; Government Notification; Assign Field Agent; Emergency Escalation';
      alertLevel = confidence >= 85 ? 'EMERGENCY' : 'HIGH ALERT';
      requiresAgent = true;
      escalate = true;
      break;
    default:
      action = 'Continue Monitoring';
      alertLevel = 'INFO';
  }

  if (impact && impact.impactLevel === 'CRITICAL' && riskLevel === 'HIGH') {
    alertLevel = 'HIGH ALERT';
    requiresAgent = true;
  }

  return { action, alertLevel, requiresAgent, escalate };
}

async function createAlert({ zoneId, level, title, description, action }) {
  const alert = await Alert.create({
    risk_zone_id: zoneId, level, title, description, recommended_action: action, status: 'ACTIVE'
  });
  return alert.toJSON();
}

module.exports = { decide, createAlert };
