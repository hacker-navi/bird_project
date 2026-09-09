const { RiskZone, Village, ImpactAssessment } = require('../db/models');

async function computeImpact(zoneId, riskLevel) {
  const zone = await RiskZone.findById(zoneId);
  const village = await Village.findById(zone.village_id);

  const nearbyVillages = await Village.countDocuments({ district_id: village.district_id, _id: { $ne: village._id } });

  const roadAffected = ['HIGH', 'CRITICAL'].includes(riskLevel) ? 'Affected' : 'Not Affected';
  const hospitalsNearby = 1;
  const schoolsNearby = 2;
  const alternativeRoute = zone.code === 'D' ? 'Unavailable' : 'Available (longer route)';
  const isolationRisk = (zone.code === 'D' && ['HIGH', 'CRITICAL'].includes(riskLevel)) ? 'HIGH' : 'LOW';

  let impactScore = 0;
  impactScore += Math.min(40, (zone.population / 1000) * 40);
  impactScore += roadAffected === 'Affected' ? 25 : 0;
  impactScore += isolationRisk === 'HIGH' ? 20 : 0;
  impactScore += alternativeRoute.startsWith('Unavailable') ? 15 : 0;
  impactScore = Math.round(Math.min(100, impactScore));

  const riskWeight = { LOW: 0.2, MEDIUM: 0.45, HIGH: 0.75, CRITICAL: 1 }[riskLevel] ?? 0.3;
  const priorityScore = Math.round(Math.min(100, impactScore * riskWeight * 1.2));
  const impactLevel = impactScore >= 76 ? 'CRITICAL' : impactScore >= 51 ? 'HIGH' : impactScore >= 26 ? 'MEDIUM' : 'LOW';

  const assessment = await ImpactAssessment.create({
    risk_zone_id: zoneId,
    population: zone.population,
    nearby_villages: nearbyVillages,
    road_affected: roadAffected,
    hospitals_nearby: hospitalsNearby,
    schools_nearby: schoolsNearby,
    alternative_route: alternativeRoute,
    isolation_risk: isolationRisk,
    impact_score: impactScore,
    priority_score: priorityScore
  });

  return {
    id: assessment._id.toString(),
    zoneName: zone.name,
    villageName: village.name,
    population: zone.population,
    nearbyVillages,
    roadAffected,
    hospitalsNearby,
    schoolsNearby,
    alternativeRoute,
    isolationRisk,
    impactScore,
    impactLevel,
    priorityScore
  };
}

module.exports = { computeImpact };
