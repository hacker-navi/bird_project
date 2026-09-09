const {
  User, State, District, Village, RiskZone, MonitoringNode,
  WeatherData, SensorReading, SatelliteData, EarthquakeData, HistoricalEvent, DataSource
} = require('./models');
const { hash } = require('./simpleHash');

async function seed() {
  const already = await State.countDocuments();
  if (already > 0) {
    console.log('[Seed] Database already has data, skipping.');
    return;
  }

  // ──────────────────────────────────────────────
  // STATE 1: MEGHALAYA — East Khasi Hills
  // ──────────────────────────────────────────────
  const meghalaya = await State.create({ name: 'Meghalaya' });
  const ekh = await District.create({ state_id: meghalaya._id, name: 'East Khasi Hills' });
  const jaintia = await District.create({ state_id: meghalaya._id, name: 'Jaintia Hills' });

  const villageABC = await Village.create({ district_id: ekh._id, name: 'Village ABC', population: 3200, latitude: 25.5788, longitude: 91.8933 });
  const villageKynshi = await Village.create({ district_id: ekh._id, name: 'Village Kynshi', population: 1800, latitude: 25.601, longitude: 91.905 });
  const villageJowai = await Village.create({ district_id: jaintia._id, name: 'Jowai Outskirts', population: 2400, latitude: 25.4436, longitude: 92.1958 });

  // ──────────────────────────────────────────────
  // STATE 2: ASSAM — Kamrup & Cachar Districts
  // ──────────────────────────────────────────────
  const assam = await State.create({ name: 'Assam' });
  const kamrup = await District.create({ state_id: assam._id, name: 'Kamrup Metropolitan' });
  const cachar = await District.create({ state_id: assam._id, name: 'Cachar' });

  const villageGuwahati = await Village.create({ district_id: kamrup._id, name: 'Guwahati Foothills', population: 5200, latitude: 26.1445, longitude: 91.7362 });
  const villageSilchar = await Village.create({ district_id: cachar._id, name: 'Silchar Slopes', population: 2900, latitude: 24.8333, longitude: 92.7789 });

  // ──────────────────────────────────────────────
  // STATE 3: MANIPUR — Senapati District
  // ──────────────────────────────────────────────
  const manipur = await State.create({ name: 'Manipur' });
  const senapati = await District.create({ state_id: manipur._id, name: 'Senapati' });
  const imphal = await District.create({ state_id: manipur._id, name: 'Imphal East' });

  const villageMao = await Village.create({ district_id: senapati._id, name: 'Mao Township Slope', population: 1650, latitude: 25.2741, longitude: 93.8667 });
  const villageImphal = await Village.create({ district_id: imphal._id, name: 'Imphal Valley Edge', population: 3100, latitude: 24.8170, longitude: 93.9368 });

  // ──────────────────────────────────────────────
  // ZONE DEFINITIONS — All NER states
  // ──────────────────────────────────────────────
  const allZoneDefs = [
    // Meghalaya – Village ABC (primary demo zones)
    { village: villageABC, code: 'A', name: 'Zone A - Riverside Slope', lat: 25.5795, lng: 91.8920, pop: 400, slope: 12, elev: 950, aspect: 'N', rock: 'Shale', soil: 'Loamy', land: 'Cultivated', susc: 20, nodeType: 'VIRTUAL' },
    { village: villageABC, code: 'B', name: 'Zone B - Mid Hill Settlement', lat: 25.5780, lng: 91.8945, pop: 900, slope: 24, elev: 1120, aspect: 'NE', rock: 'Sandstone', soil: 'Sandy-Loam', land: 'Mixed', susc: 45, nodeType: 'VIRTUAL' },
    { village: villageABC, code: 'C', name: 'Zone C - Upper Ridge Road', lat: 25.5770, lng: 91.8960, pop: 650, slope: 34, elev: 1340, aspect: 'E', rock: 'Weathered Gneiss', soil: 'Clayey', land: 'Sparse Vegetation', susc: 68, nodeType: 'REAL_SENSOR' },
    { village: villageABC, code: 'D', name: 'Zone D - Steep Cut Slope (NH Road)', lat: 25.5760, lng: 91.8975, pop: 250, slope: 42, elev: 1480, aspect: 'SE', rock: 'Fractured Gneiss', soil: 'Thin/Exposed', land: 'Deforested Cut Slope', susc: 82, nodeType: 'HYBRID' },
    // Meghalaya – Kynshi
    { village: villageKynshi, code: 'E', name: 'Zone E - Kynshi River Bank', lat: 25.6015, lng: 91.9060, pop: 310, slope: 28, elev: 880, aspect: 'W', rock: 'Limestone', soil: 'Sandy-Loam', land: 'Mixed', susc: 50, nodeType: 'VIRTUAL' },
    // Meghalaya – Jowai
    { village: villageJowai, code: 'F', name: 'Zone F - Jaintia Coal Mine Slope', lat: 25.4440, lng: 92.1970, pop: 520, slope: 38, elev: 1050, aspect: 'NE', rock: 'Coal-Shale', soil: 'Clayey', land: 'Deforested Cut Slope', susc: 76, nodeType: 'HYBRID' },
    // Assam – Guwahati
    { village: villageGuwahati, code: 'G', name: 'Zone G - Guwahati Hillside Settlement', lat: 26.1450, lng: 91.7370, pop: 1800, slope: 22, elev: 150, aspect: 'S', rock: 'Granite', soil: 'Loamy', land: 'Mixed', susc: 38, nodeType: 'VIRTUAL' },
    // Assam – Silchar
    { village: villageSilchar, code: 'H', name: 'Zone H - Silchar Barak Valley Edge', lat: 24.8338, lng: 92.7800, pop: 740, slope: 19, elev: 40, aspect: 'W', rock: 'Alluvium', soil: 'Sandy-Loam', land: 'Cultivated', susc: 28, nodeType: 'VIRTUAL' },
    // Manipur – Mao
    { village: villageMao, code: 'I', name: 'Zone I - Mao NH-2 Cut Slope', lat: 25.2745, lng: 93.8675, pop: 380, slope: 45, elev: 1900, aspect: 'SE', rock: 'Fractured Gneiss', soil: 'Thin/Exposed', land: 'Deforested Cut Slope', susc: 88, nodeType: 'HYBRID' },
    // Manipur – Imphal
    { village: villageImphal, code: 'J', name: 'Zone J - Imphal Valley Fringe', lat: 24.8175, lng: 93.9375, pop: 620, slope: 16, elev: 820, aspect: 'NW', rock: 'Shale', soil: 'Sandy-Loam', land: 'Mixed', susc: 32, nodeType: 'VIRTUAL' },
  ];

  const zoneMap = {}; // code -> zone document
  for (const z of allZoneDefs) {
    const zone = await RiskZone.create({
      village_id: z.village._id, code: z.code, name: z.name,
      latitude: z.lat, longitude: z.lng,
      population: z.pop, slope_deg: z.slope, elevation_m: z.elev, aspect: z.aspect,
      rock_type: z.rock, soil_type: z.soil, land_cover: z.land, static_susceptibility: z.susc
    });
    zoneMap[z.code] = zone;

    const node = await MonitoringNode.create({ risk_zone_id: zone._id, name: `Node-${z.code}-01`, node_type: z.nodeType, status: 'ONLINE' });

    // Initial weather baseline
    await WeatherData.create({
      risk_zone_id: zone._id, rainfall_1h: 2, rainfall_6h: 8, rainfall_24h: 40, rainfall_72h: 90,
      rainfall_intensity: 'LOW', rainfall_trend: 'STABLE', temperature: 22, humidity: 75,
      source: 'WEATHER_API', status: 'LIVE'
    });
    await SensorReading.create({
      monitoring_node_id: node._id, risk_zone_id: zone._id, soil_moisture: 35, ground_movement_mm: 0.5,
      tilt_deg: 0.2, vibration: 0.1,
      source: z.nodeType === 'REAL_SENSOR' || z.nodeType === 'HYBRID' ? 'REAL SENSOR' : 'MODELLED',
      status: z.nodeType === 'REAL_SENSOR' || z.nodeType === 'HYBRID' ? 'LIVE' : 'ESTIMATED'
    });
    await SatelliteData.create({
      risk_zone_id: zone._id, vegetation_change: 2, surface_change: 3, wetness_index: 20, land_disturbance: 5,
      source: 'ISRO_SATELLITE', status: 'MODELLED'
    });
    await EarthquakeData.create({
      risk_zone_id: zone._id, magnitude: 2.1, distance_km: 85, depth_km: 20, recent_seismic_activity: 'LOW',
      source: 'USGS', status: 'MODELLED'
    });
  }

  // Historical events
  await HistoricalEvent.create({ risk_zone_id: zoneMap['C']._id, event_date: '2019-06-14', description: 'Minor slope failure after prolonged rainfall', damage_notes: 'Partial road blockage for 6 hours', source: 'DISTRICT_RECORD' });
  await HistoricalEvent.create({ risk_zone_id: zoneMap['D']._id, event_date: '2017-07-02', description: 'Landslide on NH cut slope', damage_notes: '2 houses damaged, road closed 2 days', source: 'DISTRICT_RECORD' });
  await HistoricalEvent.create({ risk_zone_id: zoneMap['D']._id, event_date: '2022-08-20', description: 'Debris flow near NH road cutting', damage_notes: 'Road blocked 14 hours', source: 'DISTRICT_RECORD' });
  await HistoricalEvent.create({ risk_zone_id: zoneMap['F']._id, event_date: '2021-06-08', description: 'Coal overburden slope failure', damage_notes: 'Mine road blocked 3 days', source: 'DISTRICT_RECORD' });
  await HistoricalEvent.create({ risk_zone_id: zoneMap['I']._id, event_date: '2023-07-15', description: 'NH-2 cut slope landslide', damage_notes: 'National highway blocked, 1 fatality', source: 'DISTRICT_RECORD' });
  await HistoricalEvent.create({ risk_zone_id: zoneMap['I']._id, event_date: '2020-09-04', description: 'Rockfall on NH road', damage_notes: 'Road closed for 4 days', source: 'DISTRICT_RECORD' });

  // Users
  const users = [
    { name: 'Rina Admin', email: 'admin@nerlirp.gov.in', role: 'ADMIN', phone: '9000000001', home_risk_zone: null },
    { name: 'District Officer Sen', email: 'gov@nerlirp.gov.in', role: 'GOVERNMENT', phone: '9000000002', home_risk_zone: null },
    { name: 'Agent Dorji', email: 'agent1@nerlirp.gov.in', role: 'FIELD_AGENT', phone: '9000000003', home_risk_zone: null },
    { name: 'Agent Lyngdoh', email: 'agent2@nerlirp.gov.in', role: 'FIELD_AGENT', phone: '9000000004', home_risk_zone: null },
    { name: 'Agent Bora', email: 'agent3@nerlirp.gov.in', role: 'FIELD_AGENT', phone: '9000000005', home_risk_zone: null },
    { name: 'Citizen Wanpher', email: 'citizen@example.com', role: 'CITIZEN', phone: '9000000006', home_risk_zone: zoneMap['D']._id },
  ];
  for (const u of users) {
    await User.create({ name: u.name, email: u.email, password_hash: hash('demo1234'), role: u.role, phone: u.phone, home_risk_zone: u.home_risk_zone });
  }

  const sources = [
    ['OpenWeatherMap API', 'WEATHER', 0.9], ['ISRO Bhuvan Satellite', 'SATELLITE', 0.85],
    ['USGS Earthquake Feed', 'EARTHQUAKE', 0.9], ['IoT Sensor Network', 'SENSOR', 0.95],
    ['Virtual Sensor Simulator', 'SIMULATION', 0.5], ['Citizen Reports', 'CITIZEN', 0.6],
    ['Field Agent Verification', 'FIELD', 0.98], ['Gemini Vision AI', 'AI_VISION', 0.82]
  ];
  for (const [name, type, rel] of sources) {
    await DataSource.create({ name, type, status: 'ACTIVE', reliability: rel });
  }

  console.log('[Seed] Complete — 3 NER states, 10 zones, 6 users. Demo password: demo1234');
  users.forEach(u => console.log(`  ${u.role.padEnd(12)} ${u.email}`));
}

module.exports = { seed };

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  const { connectDB, mongoose } = require('./mongoose');
  connectDB()
    .then(() => seed())
    .then(() => mongoose.disconnect())
    .then(() => { console.log('[Seed] Done.'); process.exit(0); })
    .catch((err) => { console.error('[Seed] Failed:', err.message); process.exit(1); });
}
