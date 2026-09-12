# 📦 NER-LIRP — Complete Codebase Reference (codes.md)

> **SIH Problem Statement SIH26001:** AI-Based Early Warning and Landslide Risk Monitoring System in Northeast Region (NER)
> **Platform:** North East Region Landslide Intelligence & Response Platform (NER-LIRP)
> **Generated for:** LLM Context & Architectural Understanding (Gemini, Claude, GPT)

---

## 📑 Table of Contents

- [package.json](#packagejson) — *Project configuration and dependencies*
- [server.js](#serverjs) — *Main Express & Socket.io server bootstrap*
- [db/mongoose.js](#dbmongoosejs) — *MongoDB connection and global toJSON plugin*
- [db/models.js](#dbmodelsjs) — *All Mongoose schemas & models*
- [db/seed.js](#dbseedjs) — *Seed data across 3 NER states, 10 zones, and demo users*
- [db/simpleHash.js](#dbsimplehashjs) — *Password hashing utility*
- [services/satelliteService.js](#servicessatelliteservicejs) — *Bi-temporal Sentinel-2 optical & Sentinel-1 InSAR change detection engine*
- [services/imageAnalysis.js](#servicesimageanalysisjs) — *Hybrid Edge/Cloud Vision AI with Ollama and OpenRouter/Gemini fallback*
- [services/riskEngine.js](#servicesriskenginejs) — *3-Layer risk calculation & Confidence engine with orbital verification*
- [services/impactEngine.js](#servicesimpactenginejs) — *Vulnerability & infrastructure impact scoring*
- [services/escalationJob.js](#servicesescalationjobjs) — *Cron jobs: auto-escalation, predictive alerts, cluster detection*
- [services/pipeline.js](#servicespipelinejs) — *Closed-loop pipeline runner & WebSocket dispatcher*
- [services/weatherFetcher.js](#servicesweatherfetcherjs) — *OpenWeatherMap integration & weather updater*
- [services/pushService.js](#servicespushservicejs) — *VAPID Web Push notification service*
- [services/decisionEngine.js](#servicesdecisionenginejs) — *Action protocol generator based on risk and impact*
- [routes/satellite.js](#routessatellitejs) — *Orbital Earth Observation endpoints & bi-temporal change analysis*
- [routes/citizenReports.js](#routescitizenreportsjs) — *Citizen report ingestion, Ollama AI trigger, photo serving*
- [routes/agents.js](#routesagentsjs) — *Field agent assignments, verification reports, navigation links*
- [routes/alerts.js](#routesalertsjs) — *Emergency alerts CRUD and lifecycle*
- [routes/simulation.js](#routessimulationjs) — *Sensor operator sliders and 15-step demo endpoints*
- [routes/risk.js](#routesriskjs) — *Risk predictions and factor breakdowns*
- [routes/locations.js](#routeslocationsjs) — *State, district, village, and risk zone endpoints*
- [routes/weather.js](#routesweatherjs) — *Zone weather readings and refresh endpoint*
- [routes/monitoring.js](#routesmonitoringjs) — *Monitoring nodes and sensor readings*
- [routes/auth.js](#routesauthjs) — *User authentication and profile*
- [routes/analytics.js](#routesanalyticsjs) — *Zone statistics and historical analytics*
- [routes/push.js](#routespushjs) — *VAPID public key and device subscription endpoint*
- [public/launcher.html](#publiclauncherhtml) — *Mobile launcher screen for Citizen and Field Agent roles*
- [public/citizen.html](#publiccitizenhtml) — *Citizen mobile reporting interface*
- [public/agent.html](#publicagenthtml) — *Field Agent response and verification interface*
- [public/sensor.html](#publicsensorhtml) — *Virtual Sensor Operator simulation console with bi-temporal satellite controls*
- [public/index.html](#publicindexhtml) — *Government Command Center Dashboard with interactive Satellite split viewer*
- [public/js/common.js](#publicjscommonjs) — *Shared client utilities (API calls, toasts, session)*
- [public/js/citizen.js](#publicjscitizenjs) — *Citizen app client logic (GPS, camera, Canvas compression, sync)*
- [public/js/agent.js](#publicjsagentjs) — *Agent app client logic (navigation, verification, photo upload)*
- [public/js/sensor.js](#publicjssensorjs) — *Sensor operator console sliders and bi-temporal satellite trigger*
- [public/js/push-client.js](#publicjspushclientjs) — *Service worker registration and push subscription client*
- [public/js/dashboard.js](#publicjsdashboardjs) — *Command dashboard logic with Satellite split comparison slider and HUD*

---

## File: package.json
**Purpose:** Project configuration and dependencies  
**Path:** package.json

`json
{
  "name": "ner-lirp",
  "version": "1.0.0",
  "description": "North East Region Landslide Intelligence & Response Platform",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "seed": "node db/seed.js"
  },
  "dependencies": {
    "@google/generative-ai": "^0.24.1",
    "axios": "^1.20.0",
    "body-parser": "^1.20.2",
    "cors": "^2.8.5",
    "dotenv": "^17.4.2",
    "express": "^4.19.2",
    "express-async-errors": "^3.1.1",
    "mongoose": "^9.9.5",
    "node-cron": "^4.6.0",
    "socket.io": "^4.7.5",
    "web-push": "^3.6.7"
  }
}
`

---

## File: server.js
**Purpose:** Main Express & Socket.io server bootstrap  
**Path:** server.js

`javascript
require('dotenv').config({ quiet: true });
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { connectDB } = require('./db/mongoose');
const { seed } = require('./db/seed');
const { attachIO } = require('./services/pipeline');
const { RiskZone, RiskPrediction } = require('./db/models');
const { calculateRisk } = require('./services/riskEngine');
const { computeImpact } = require('./services/impactEngine');
const { startJobs, attachIO: attachEscalationIO } = require('./services/escalationJob');

async function bootstrap() {
  await connectDB();
  await seed();

  // Ensure every zone has an initial prediction so dashboards aren't empty on first load
  const zones = await RiskZone.find().select('_id');
  for (const z of zones) {
    const existing = await RiskPrediction.findOne({ risk_zone_id: z._id });
    if (!existing) {
      const prediction = await calculateRisk(z._id);
      await computeImpact(z._id, prediction.riskLevel);
    }
  }

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  attachIO(io);
  attachEscalationIO(io);

  app.use(cors());
  // Increased limit for base64 image uploads (max 8mb)
  app.use(bodyParser.json({ limit: '8mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'OK', system: 'NER-LIRP', db: 'MongoDB',
      gemini: !!process.env.GEMINI_API_KEY,
      openweather: !!process.env.OPENWEATHER_API_KEY,
      time: new Date().toISOString()
    });
  });

  app.use('/api', require('./routes/auth'));
  app.use('/api', require('./routes/locations'));
  app.use('/api', require('./routes/monitoring'));
  app.use('/api', require('./routes/weather'));
  app.use('/api', require('./routes/risk'));
  app.use('/api', require('./routes/citizenReports'));
  app.use('/api', require('./routes/agents'));
  app.use('/api', require('./routes/alerts'));
  app.use('/api', require('./routes/simulation'));
  app.use('/api', require('./routes/analytics'));
  app.use('/api', require('./routes/push'));
  app.use('/api', require('./routes/satellite'));

  // Centralized error handler
  app.use((err, req, res, next) => {
    console.error('[API Error]', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  io.on('connection', (socket) => {
    socket.emit('connected', { message: 'Connected to NER-LIRP real-time stream' });
  });

  // Start background jobs (escalation, predictive, cluster, weather refresh)
  startJobs();

  const PORT = process.env.PORT || 4000;
  const HOST = process.env.HOST || '0.0.0.0';
  server.listen(PORT, HOST, () => {
    console.log(`\n=================================================`);
    console.log(` NER-LIRP server running on http://localhost:${PORT}`);
    console.log(` AI Features: Ollama (Local)=✅ | Weather=${!!process.env.OPENWEATHER_API_KEY ? '✅' : '❌ (add OPENWEATHER_API_KEY)'}`);
    console.log(``);
    console.log(` Laptop  (Admin/Government) : http://localhost:${PORT}/`);
    console.log(` Phone 1 (Sensor Operator)  : http://<laptop-IP>:${PORT}/sensor.html`);
    console.log(` Phone 2 (Citizen + Agent)  : http://<laptop-IP>:${PORT}/launcher.html`);
    console.log(`=================================================\n`);
  });
}

bootstrap().catch((err) => {
  console.error('[Fatal] Failed to start NER-LIRP:', err.message);
  console.error('Is MongoDB running? Check MONGODB_URI in your .env file.');
  process.exit(1);
});
`

---

## File: db/mongoose.js
**Purpose:** MongoDB connection and global toJSON plugin  
**Path:** db/mongoose.js

`javascript
const mongoose = require('mongoose');

// Every document gets .toJSON() transformed so the API keeps returning
// a plain "id" string field (like the original SQLite build did) instead
// of Mongo's _id/__v — this keeps all existing frontend code working
// unchanged against the new database.
const idTransformPlugin = (schema) => {
  schema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
      if (ret && ret._id != null) {
        ret.id = ret._id.toString();
        delete ret._id;
      }
      if (ret) {
        delete ret.__v;
      }
      return ret;
    }
  });
  schema.set('toObject', { virtuals: true });
};

mongoose.plugin(idTransformPlugin);

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nerlirp';
  mongoose.set('strictQuery', true);
  // Fail fast (5s) with a clear error instead of hanging on the default 30s
  // server-selection timeout when MongoDB isn't reachable.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log(`[MongoDB] Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  return mongoose.connection;
}

module.exports = { connectDB, mongoose };
`

---

## File: db/models.js
**Purpose:** All Mongoose schemas & models  
**Path:** db/models.js

`javascript
const { mongoose } = require('./mongoose');
const { Schema } = mongoose;

// NOTE: field names are deliberately snake_case (unusual for Mongoose/JS)
// so that the REST API keeps returning exactly the same shape the three
// front-ends (dashboard/citizen/agent) already expect. This kept the
// SQLite -> MongoDB migration a database-layer change only.

// ============ IDENTITY ============
const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'GOVERNMENT', 'FIELD_AGENT', 'CITIZEN'], required: true },
  phone: String,
  status: { type: String, default: 'ACTIVE' },
  agent_status: { type: String, default: 'AVAILABLE' },
  home_risk_zone: { type: Schema.Types.ObjectId, ref: 'RiskZone', default: null },
  created_at: { type: Date, default: Date.now }
});

// ============ PUSH SUBSCRIPTIONS (real Web Push) ============
const PushSubscriptionSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  device_label: { type: String, default: 'Unknown device' },
  app_role: { type: String, enum: ['CITIZEN', 'FIELD_AGENT', 'GOVERNMENT', 'ADMIN'], required: true },
  watch_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', default: null },
  endpoint: { type: String, required: true, unique: true },
  keys: { p256dh: String, auth: String },
  created_at: { type: Date, default: Date.now }
});

// ============ LOCATION HIERARCHY ============
const StateSchema = new Schema({ name: { type: String, required: true } });

const DistrictSchema = new Schema({
  state_id: { type: Schema.Types.ObjectId, ref: 'State', required: true },
  name: { type: String, required: true }
});

const VillageSchema = new Schema({
  district_id: { type: Schema.Types.ObjectId, ref: 'District', required: true },
  name: { type: String, required: true },
  population: { type: Number, default: 0 },
  latitude: Number,
  longitude: Number
});

const RiskZoneSchema = new Schema({
  village_id: { type: Schema.Types.ObjectId, ref: 'Village', required: true },
  code: { type: String, required: true },
  name: { type: String, required: true },
  latitude: Number,
  longitude: Number,
  population: { type: Number, default: 0 },
  slope_deg: Number,
  elevation_m: Number,
  aspect: String,
  rock_type: String,
  soil_type: String,
  land_cover: String,
  static_susceptibility: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

// ============ MONITORING NODES ============
const MonitoringNodeSchema = new Schema({
  risk_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', required: true },
  name: { type: String, required: true },
  node_type: { type: String, enum: ['VIRTUAL', 'REAL_SENSOR', 'HYBRID'], default: 'VIRTUAL' },
  status: { type: String, default: 'ONLINE' },
  last_updated: { type: Date, default: Date.now }
});

// ============ DATA LAYERS ============
const WeatherDataSchema = new Schema({
  risk_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', required: true, index: true },
  rainfall_1h: Number, rainfall_6h: Number, rainfall_24h: Number, rainfall_72h: Number,
  rainfall_intensity: String, rainfall_trend: String,
  temperature: Number, humidity: Number,
  source: { type: String, default: 'SIMULATOR' },
  status: { type: String, default: 'DEMO DATA' },
  timestamp: { type: Date, default: Date.now }
});

const SensorReadingSchema = new Schema({
  monitoring_node_id: { type: Schema.Types.ObjectId, ref: 'MonitoringNode' },
  risk_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', required: true, index: true },
  soil_moisture: Number,
  ground_movement_mm: Number,
  tilt_deg: Number,
  vibration: Number,
  source: { type: String, default: 'SIMULATOR' },
  status: { type: String, default: 'DEMO DATA' },
  timestamp: { type: Date, default: Date.now }
});

const SatelliteDataSchema = new Schema({
  risk_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', required: true, index: true },
  satellite_mission: { type: String, default: 'Sentinel-2 (MSI) & Sentinel-1 (C-SAR InSAR)' },
  before_image_url: { type: String, default: '/img/satellite/sector1_before.jpg' },
  after_image_url: { type: String, default: '/img/satellite/sector1_after.jpg' },
  before_pass_date: { type: Date, default: () => new Date(Date.now() - 14 * 86400 * 1000) },
  after_pass_date: { type: Date, default: Date.now },
  ndvi_baseline: { type: Number, default: 0.74 },
  ndvi_current: { type: Number, default: 0.32 },
  vegetation_loss_pct: { type: Number, default: 56.8 },
  scar_area_sqm: { type: Number, default: 18450 },
  surface_displacement_cm: { type: Number, default: 28.4 },
  insar_coherence: { type: Number, default: 0.42 },
  surface_change: { type: Number, default: 18 },
  vegetation_change: { type: Number, default: 15 },
  wetness_index: { type: Number, default: 62 },
  land_disturbance: { type: Number, default: 16 },
  change_detected: { type: Boolean, default: true },
  scenario_type: { type: String, enum: ['BASELINE', 'MODERATE_CREEP', 'CATASTROPHIC_SLIDE'], default: 'CATASTROPHIC_SLIDE' },
  analysis_summary: { type: String, default: 'Automated bi-temporal change detection detected significant slope failure scar (18,450 m²) with 56.8% NDVI drop along highway corridor.' },
  confidence_boost: { type: Number, default: 16 },
  source: { type: String, default: 'SENTINEL_COPERNICUS' },
  status: { type: String, default: 'VERIFIED_CHANGE' },
  timestamp: { type: Date, default: Date.now }
});

const EarthquakeDataSchema = new Schema({
  risk_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', required: true, index: true },
  magnitude: Number,
  distance_km: Number,
  depth_km: Number,
  recent_seismic_activity: String,
  source: { type: String, default: 'MODELLED' },
  status: { type: String, default: 'ESTIMATED' },
  timestamp: { type: Date, default: Date.now }
});

const HistoricalEventSchema = new Schema({
  risk_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', required: true },
  event_date: String,
  description: String,
  damage_notes: String,
  source: { type: String, default: 'RECORD' }
});

// ============ AI / RISK ============
const RiskPredictionSchema = new Schema({
  risk_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', required: true, index: true },
  static_score: Number,
  dynamic_score: Number,
  evidence_score: Number,
  final_score: Number,
  risk_level: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
  confidence: Number,
  factors: [{
    name: String, contribution: Number, level: String, layer: String,
    detail: String, source: String, status: String
  }],
  evidence_summary: { type: Schema.Types.Mixed, default: {} },
  created_at: { type: Date, default: Date.now }
});

// ============ CITIZEN & FIELD ============
const ImageAnalysisSchema = new Schema({
  match: { type: Boolean, default: false },
  confidence: { type: Number, default: 0 },
  detected_type: String,
  ai_description: String,
  severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'LOW' },
  visible_features: [String],
  analyzed_at: Date,
  source: String,
  skipped: { type: Boolean, default: false }
}, { _id: false });

const CitizenReportSchema = new Schema({
  risk_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', required: true, index: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  incident_type: {
    type: String,
    enum: ['Road Crack', 'Ground Crack', 'Rock Fall', 'Mud Movement', 'Landslide', 'Flooding', 'Blocked Road', 'Other Hazard'],
    required: true
  },
  description: String,
  latitude: Number,
  longitude: Number,
  gps_accuracy: Number,           // metres from device geolocation
  photo_base64: String,           // actual image data (base64)
  photo_mime: { type: String, default: 'image/jpeg' },
  photo_note: String,
  image_analysis: ImageAnalysisSchema, // AI vision result
  text_analysis: { type: Schema.Types.Mixed, default: {} }, // AI text severity
  status: { type: String, enum: ['NEW', 'UNDER REVIEW', 'VERIFIED', 'REJECTED', 'RESOLVED'], default: 'NEW' },
  evidence_score: { type: Number, default: 0 },
  sync_status: { type: String, default: 'SYNCED' },
  created_at: { type: Date, default: Date.now }
});

const FieldReportSchema = new Schema({
  assignment_id: { type: Schema.Types.ObjectId, ref: 'AgentAssignment', default: null },
  risk_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', required: true },
  agent_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  notes: String,
  verification_result: { type: String, enum: ['CONFIRMED', 'PARTIAL', 'FALSE_ALARM'] },
  photo_base64: String,           // actual field evidence image
  photo_mime: { type: String, default: 'image/jpeg' },
  photo_note: String,
  agent_gps: { lat: Number, lng: Number, accuracy: Number }, // agent's GPS at site
  image_analysis: ImageAnalysisSchema, // AI analysis of agent's photo
  created_at: { type: Date, default: Date.now }
});

const AgentAssignmentSchema = new Schema({
  risk_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', required: true },
  agent_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  citizen_report_id: { type: Schema.Types.ObjectId, ref: 'CitizenReport', default: null },
  priority: { type: String, default: 'HIGH' },
  status: { type: String, enum: ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED'], default: 'ASSIGNED' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// ============ IMPACT / DECISION / ALERT ============
const ImpactAssessmentSchema = new Schema({
  risk_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', required: true, index: true },
  population: Number,
  nearby_villages: Number,
  road_affected: String,
  hospitals_nearby: Number,
  schools_nearby: Number,
  alternative_route: String,
  isolation_risk: String,
  impact_score: Number,
  priority_score: Number,
  created_at: { type: Date, default: Date.now }
});

const AlertSchema = new Schema({
  risk_zone_id: { type: Schema.Types.ObjectId, ref: 'RiskZone', required: true, index: true },
  level: { type: String, enum: ['INFO', 'WATCH', 'WARNING', 'HIGH ALERT', 'EMERGENCY'], required: true },
  title: String,
  description: String,
  recommended_action: String,
  status: { type: String, default: 'ACTIVE' },
  push_sent: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

const AuditLogSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  action: String,
  entity: String,
  details: Schema.Types.Mixed,
  created_at: { type: Date, default: Date.now }
});

const DataSourceSchema = new Schema({
  name: String,
  type: String,
  status: { type: String, default: 'ACTIVE' },
  reliability: { type: Number, default: 0.8 }
});

module.exports = {
  User: mongoose.model('User', UserSchema),
  PushSubscription: mongoose.model('PushSubscription', PushSubscriptionSchema),
  State: mongoose.model('State', StateSchema),
  District: mongoose.model('District', DistrictSchema),
  Village: mongoose.model('Village', VillageSchema),
  RiskZone: mongoose.model('RiskZone', RiskZoneSchema),
  MonitoringNode: mongoose.model('MonitoringNode', MonitoringNodeSchema),
  WeatherData: mongoose.model('WeatherData', WeatherDataSchema),
  SensorReading: mongoose.model('SensorReading', SensorReadingSchema),
  SatelliteData: mongoose.model('SatelliteData', SatelliteDataSchema),
  EarthquakeData: mongoose.model('EarthquakeData', EarthquakeDataSchema),
  HistoricalEvent: mongoose.model('HistoricalEvent', HistoricalEventSchema),
  RiskPrediction: mongoose.model('RiskPrediction', RiskPredictionSchema),
  CitizenReport: mongoose.model('CitizenReport', CitizenReportSchema),
  FieldReport: mongoose.model('FieldReport', FieldReportSchema),
  AgentAssignment: mongoose.model('AgentAssignment', AgentAssignmentSchema),
  ImpactAssessment: mongoose.model('ImpactAssessment', ImpactAssessmentSchema),
  Alert: mongoose.model('Alert', AlertSchema),
  AuditLog: mongoose.model('AuditLog', AuditLogSchema),
  DataSource: mongoose.model('DataSource', DataSourceSchema)
};
`

---

## File: db/seed.js
**Purpose:** Seed data across 3 NER states, 10 zones, and demo users  
**Path:** db/seed.js

`javascript
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
`

---

## File: db/simpleHash.js
**Purpose:** Password hashing utility  
**Path:** db/simpleHash.js

`javascript
// Lightweight salted-hash helper (avoids adding a native bcrypt dependency
// for this demo). NOT a substitute for a production-grade KDF like bcrypt/argon2 -
// swap this out before real deployment (see README "Production Extensibility").
const crypto = require('crypto');

const SALT = 'ner-lirp-demo-salt-v1';

function hash(password) {
  return crypto.createHash('sha256').update(SALT + password).digest('hex');
}

function verify(password, hashed) {
  return hash(password) === hashed;
}

module.exports = { hash, verify };
`

---

## File: services/satelliteService.js
**Purpose:** Bi-temporal Sentinel-2 optical & Sentinel-1 InSAR change detection engine  
**Path:** services/satelliteService.js

`javascript
/**
 * satelliteService.js
 * Bi-temporal satellite change detection and orbital verification engine for NER-LIRP.
 * Simulates real Sentinel-2 (Optical MSI) & Sentinel-1 (C-SAR InSAR) earth observation passes.
 * Compares Pre-event vs Post-event imagery, calculates NDVI loss, scar area footprint,
 * and surface displacement to feed Layer 2 risk and boost the Confidence Engine.
 */

const { SatelliteData, RiskZone } = require('../db/models');

const SATELLITE_SCENARIOS = {
  BASELINE: {
    scenario_type: 'BASELINE',
    before_image_url: '/img/satellite/sector1_before.jpg',
    after_image_url: '/img/satellite/sector1_before.jpg',
    before_pass_offset_days: 20,
    after_pass_offset_days: 1,
    ndvi_baseline: 0.76,
    ndvi_current: 0.74,
    vegetation_loss_pct: 2.6,
    scar_area_sqm: 0,
    surface_displacement_cm: 0.4,
    insar_coherence: 0.88,
    surface_change: 2,
    vegetation_change: 2,
    wetness_index: 20,
    land_disturbance: 3,
    change_detected: false,
    confidence_boost: 0,
    analysis_summary: 'Optical & InSAR bi-temporal baseline pass: Stable terrain. No significant slope deformation or canopy loss detected.',
    status: 'BASELINE_STABLE'
  },
  MODERATE_CREEP: {
    scenario_type: 'MODERATE_CREEP',
    before_image_url: '/img/satellite/sector1_before.jpg',
    after_image_url: '/img/satellite/sector1_after.jpg',
    before_pass_offset_days: 14,
    after_pass_offset_days: 0.5,
    ndvi_baseline: 0.74,
    ndvi_current: 0.58,
    vegetation_loss_pct: 21.6,
    scar_area_sqm: 4800,
    surface_displacement_cm: 8.6,
    insar_coherence: 0.64,
    surface_change: 9,
    vegetation_change: 8,
    wetness_index: 45,
    land_disturbance: 8,
    change_detected: true,
    confidence_boost: 10,
    analysis_summary: 'Sentinel-1 InSAR interferogram reveals active slope velocity acceleration (8.6 cm cumulative displacement). Sentinel-2 shows initial tension crack vegetation thinning (4,800 m²).',
    status: 'ACTIVE_SLOPE_CREEP'
  },
  CATASTROPHIC_SLIDE: {
    scenario_type: 'CATASTROPHIC_SLIDE',
    before_image_url: '/img/satellite/sector1_before.jpg',
    after_image_url: '/img/satellite/sector1_after.jpg',
    before_pass_offset_days: 14,
    after_pass_offset_days: 0.1,
    ndvi_baseline: 0.74,
    ndvi_current: 0.32,
    vegetation_loss_pct: 56.8,
    scar_area_sqm: 18450,
    surface_displacement_cm: 28.4,
    insar_coherence: 0.35,
    surface_change: 18,
    vegetation_change: 16,
    wetness_index: 68,
    land_disturbance: 18,
    change_detected: true,
    confidence_boost: 18,
    analysis_summary: 'Orbital Verification Alert: Bi-temporal Sentinel-2 comparison detects massive 18,450 m² fresh debris avalanche scar with 56.8% NDVI drop. Mountain road corridor severed; debris runout into river channel confirmed.',
    status: 'VERIFIED_CATASTROPHIC_CHANGE'
  }
};

/**
 * Record a new satellite pass observation for a zone
 */
async function recordSatellitePass(zoneId, scenarioKey = 'CATASTROPHIC_SLIDE', customNotes = '') {
  const scenario = SATELLITE_SCENARIOS[scenarioKey] || SATELLITE_SCENARIOS.CATASTROPHIC_SLIDE;
  const zone = await RiskZone.findById(zoneId);
  if (!zone) throw new Error('Risk zone not found');

  const beforeDate = new Date(Date.now() - scenario.before_pass_offset_days * 86400 * 1000);
  const afterDate = new Date(Date.now() - scenario.after_pass_offset_days * 86400 * 1000);

  const satRecord = await SatelliteData.create({
    risk_zone_id: zoneId,
    satellite_mission: 'Sentinel-2 (MSI Optical) & Sentinel-1 (C-SAR InSAR)',
    before_image_url: scenario.before_image_url,
    after_image_url: scenario.after_image_url,
    before_pass_date: beforeDate,
    after_pass_date: afterDate,
    ndvi_baseline: scenario.ndvi_baseline,
    ndvi_current: scenario.ndvi_current,
    vegetation_loss_pct: scenario.vegetation_loss_pct,
    scar_area_sqm: scenario.scar_area_sqm,
    surface_displacement_cm: scenario.surface_displacement_cm,
    insar_coherence: scenario.insar_coherence,
    surface_change: scenario.surface_change,
    vegetation_change: scenario.vegetation_change,
    wetness_index: scenario.wetness_index,
    land_disturbance: scenario.land_disturbance,
    change_detected: scenario.change_detected,
    scenario_type: scenario.scenario_type,
    analysis_summary: customNotes || scenario.analysis_summary,
    confidence_boost: scenario.confidence_boost,
    source: 'SENTINEL_COPERNICUS_ORBITAL',
    status: scenario.status
  });

  return satRecord.toJSON();
}

/**
 * Get the latest satellite analysis profile for a zone
 */
async function getZoneSatelliteProfile(zoneId) {
  let record = await SatelliteData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 });
  if (!record) {
    // Seed default baseline if none exists
    const created = await recordSatellitePass(zoneId, 'BASELINE');
    return created;
  }
  return record.toJSON();
}

module.exports = {
  recordSatellitePass,
  getZoneSatelliteProfile,
  SATELLITE_SCENARIOS
};
`

---

## File: services/imageAnalysis.js
**Purpose:** Hybrid Edge/Cloud Vision AI with Ollama and OpenRouter/Gemini fallback  
**Path:** services/imageAnalysis.js

`javascript
/**
 * imageAnalysis.js
 * Wraps local Ollama models to:
 *  1. Analyze a photo and check if it matches the reported incident type (using llama3.2-vision:11b)
 *  2. Analyze a text description for hazard keywords (using qwen3:latest)
 * Runs completely locally, no internet or cloud API keys required.
 */

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate').replace('localhost', '127.0.0.1');
const VISION_MODEL = process.env.VISION_MODEL || 'llama3.2-vision:11b';
const TEXT_MODEL = process.env.TEXT_MODEL || 'qwen3:latest';

const HAZARD_KEYWORDS = {
  'Landslide': ['landslide', 'debris', 'slope failure', 'mudflow', 'earth movement', 'slope collapse', 'fallen earth', 'hillslide'],
  'Rock Fall': ['rock', 'boulder', 'rockfall', 'stone', 'falling rock', 'cliff', 'rock debris'],
  'Mud Movement': ['mud', 'mudslide', 'clay', 'silt', 'brown flow', 'mud stream', 'wet soil'],
  'Ground Crack': ['crack', 'fissure', 'split', 'fracture', 'crevice', 'ground opening', 'soil crack'],
  'Road Crack': ['crack', 'road damage', 'asphalt', 'tarmac', 'pavement', 'road fracture', 'road split'],
  'Flooding': ['flood', 'water', 'inundation', 'waterlogging', 'submersion', 'overflow'],
  'Blocked Road': ['blocked', 'obstruction', 'debris on road', 'road closure', 'road blocked', 'traffic blockage'],
  'Other Hazard': ['hazard', 'danger', 'risk', 'unstable', 'collapse']
};

const SEVERITY_INDICATORS = ['severe', 'major', 'large', 'significant', 'massive', 'extensive', 'wide', 'deep', 'critical', 'serious'];

/**
 * Perform a POST request to Ollama REST API using native fetch
 */
async function ollamaGenerate(model, prompt, images = [], format = 'json') {
  const payload = {
    model,
    prompt,
    stream: false,
    format: format
  };

  if (images && images.length > 0) {
    payload.images = images;
  }

  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000) // 90s for local vision inference
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errJson = await response.json();
      if (errJson && errJson.error) errorDetail = errJson.error;
    } catch (_) { }
    throw new Error(`Ollama API error (${response.status}): ${errorDetail}`);
  }

  const data = await response.json();
  return data.response;
}

function cleanJsonResponse(text) {
  if (!text) return '{}';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';
const OPENROUTER_VISION_MODEL = process.env.OPENROUTER_VISION_MODEL || 'inclusionai/ling-3.0-flash-vl:free';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Online Cloud Vision fallback using OpenRouter or Google Gemini
 */
async function analyzeWithCloud(base64Image, incidentType, mimeType = 'image/jpeg') {
  const prompt = `You are an AI assistant helping analyze photos submitted to a landslide early warning system in Northeast India.
The citizen reported this incident type: "${incidentType}"

Analyze the image and respond with ONLY a JSON object (no markdown, no extra commentary):
{
  "contains_hazard": true or false,
  "detected_hazard_type": "best matching type from: Landslide, Rock Fall, Mud Movement, Ground Crack, Road Crack, Flooding, Blocked Road, Other Hazard, None",
  "matches_reported_type": true or false,
  "confidence": number from 0 to 100,
  "severity": "LOW", "MEDIUM", or "HIGH",
  "description": "1-2 sentence description of what you see in the image relevant to landslide/geological hazard",
  "visible_features": ["list", "of", "visible", "hazard", "features"]
}

Be conservative — only say matches_reported_type=true if the image clearly shows evidence of the reported hazard.`;

  // 1. Try OpenRouter multimodal vision
  if (OPENROUTER_API_KEY) {
    try {
      console.log(`[ImageAI] 🌐 Analyzing image online via OpenRouter (${OPENROUTER_VISION_MODEL})...`);
      const dataUri = base64Image.startsWith('data:') ? base64Image : `data:${mimeType};base64,${base64Image}`;
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: OPENROUTER_VISION_MODEL,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUri } }
            ]
          }]
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const jsonStr = cleanJsonResponse(content);
          const parsed = JSON.parse(jsonStr);
          const match = parsed.matches_reported_type === true || parsed.match === true;
          let confidence = Number(parsed.confidence) || 0;
          if (!parsed.contains_hazard && parsed.contains_hazard !== undefined) confidence = Math.min(confidence, 30);
          if (match && confidence < 60) confidence = 60;

          console.log(`[ImageAI] ✅ Online vision completed: ${match ? 'MATCH' : 'NO_MATCH'} (${confidence}% confidence)`);
          return {
            match,
            confidence: Math.round(Math.min(100, Math.max(0, confidence))),
            detected_type: parsed.detected_hazard_type || parsed.detected_type || 'Unknown',
            ai_description: parsed.description || parsed.ai_description || '',
            severity: parsed.severity || 'LOW',
            visible_features: parsed.visible_features || [],
            analyzed_at: new Date().toISOString(),
            source: 'ONLINE_CLOUD_VISION'
          };
        }
      } else {
        const errText = await res.text();
        console.warn('[ImageAI] OpenRouter vision returned status:', res.status, errText.slice(0, 150));
      }
    } catch (e) {
      console.error('[ImageAI] Online vision (OpenRouter) failed:', e.message);
    }
  }

  // 2. Try Google Gemini if key available
  if (GEMINI_API_KEY) {
    try {
      console.log('[ImageAI] 🌐 Analyzing image online via Google Gemini...');
      const cleanB64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: cleanB64 } }
            ]
          }]
        }),
        signal: AbortSignal.timeout(30000)
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          const jsonStr = cleanJsonResponse(content);
          const parsed = JSON.parse(jsonStr);
          const match = parsed.matches_reported_type === true || parsed.match === true;
          let confidence = Number(parsed.confidence) || 0;
          if (!parsed.contains_hazard && parsed.contains_hazard !== undefined) confidence = Math.min(confidence, 30);
          if (match && confidence < 60) confidence = 60;
          return {
            match,
            confidence: Math.round(Math.min(100, Math.max(0, confidence))),
            detected_type: parsed.detected_hazard_type || parsed.detected_type || 'Unknown',
            ai_description: parsed.description || parsed.ai_description || '',
            severity: parsed.severity || 'LOW',
            visible_features: parsed.visible_features || [],
            analyzed_at: new Date().toISOString(),
            source: 'ONLINE_GEMINI_VISION'
          };
        }
      }
    } catch (e) {
      console.error('[ImageAI] Online vision (Gemini) failed:', e.message);
    }
  }

  return neutralResult(incidentType, 'ANALYSIS_ERROR');
}

/**
 * Analyze a base64 image against the expected incident type.
 * Returns: { match, confidence (0-100), detected_type, ai_description, severity, analyzed_at }
 */
async function analyzeIncidentImage(base64Image, incidentType, mimeType = 'image/jpeg') {
  if (!base64Image) {
    return neutralResult(incidentType, 'NO_IMAGE');
  }

  try {
    const prompt = `You are an AI assistant helping analyze photos submitted to a landslide early warning system in Northeast India.

The citizen reported this incident type: "${incidentType}"

Analyze the image and respond with ONLY a JSON object (no markdown, no extra text):
{
  "contains_hazard": true or false,
  "detected_hazard_type": "best matching type from: Landslide, Rock Fall, Mud Movement, Ground Crack, Road Crack, Flooding, Blocked Road, Other Hazard, None",
  "matches_reported_type": true or false,
  "confidence": number from 0 to 100 (how confident you are this image shows the reported hazard),
  "severity": "LOW", "MEDIUM", or "HIGH",
  "description": "1-2 sentence description of what you see in the image relevant to landslide/geological hazard",
  "visible_features": ["list", "of", "visible", "hazard", "features"]
}

Be conservative — only say matches_reported_type=true if the image clearly shows evidence of the reported hazard.`;

    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

    console.log(`[ImageAI] Analyzing image with local ${VISION_MODEL}...`);
    const text = await ollamaGenerate(VISION_MODEL, prompt, [base64Data], 'json');

    const jsonStr = cleanJsonResponse(text);
    const parsed = JSON.parse(jsonStr);

    const match = parsed.matches_reported_type === true;
    let confidence = Number(parsed.confidence) || 0;
    // If no hazard detected, cap confidence at 30
    if (!parsed.contains_hazard) confidence = Math.min(confidence, 30);
    // If matches perfectly, minimum confidence is 60
    if (match && confidence < 60) confidence = 60;

    return {
      match,
      confidence: Math.round(Math.min(100, Math.max(0, confidence))),
      detected_type: parsed.detected_hazard_type || 'Unknown',
      ai_description: parsed.description || '',
      severity: parsed.severity || 'LOW',
      visible_features: parsed.visible_features || [],
      analyzed_at: new Date().toISOString(),
      source: 'OLLAMA_VISION'
    };
  } catch (err) {
    if (err.message.includes('mllama') || err.message.includes('unknown model architecture')) {
      console.warn('[ImageAI] ⚠ Local Ollama lacks "mllama" architecture for llama3.2-vision.');
      console.log('[ImageAI] 🌐 Seamlessly falling back to Online Cloud Vision AI...');
    } else if (err.message.includes('fetch failed') || err.cause?.code === 'ECONNREFUSED') {
      console.warn(`[ImageAI] ⚠ Local Ollama is not running on ${OLLAMA_URL}.`);
      console.log('[ImageAI] 🌐 Seamlessly falling back to Online Cloud Vision AI...');
    } else {
      console.warn('[ImageAI] Local vision analysis failed:', err.message);
      console.log('[ImageAI] 🌐 Falling back to Online Cloud Vision AI...');
    }

    // Automatically fall back to Online Vision
    return await analyzeWithCloud(base64Image, incidentType, mimeType);
  }
}

/**
 * Analyze a text description for hazard severity keywords.
 * Used when no image is available but description was provided.
 * Returns: { severity_score (0-30), keywords_found, ai_enhanced }
 */
async function analyzeTextDescription(description, incidentType) {
  if (!description || description.trim().length < 5) {
    return { severity_score: 0, keywords_found: [], ai_enhanced: false };
  }

  const lower = description.toLowerCase();

  // Rule-based keyword matching
  const hazardKw = HAZARD_KEYWORDS[incidentType] || HAZARD_KEYWORDS['Other Hazard'];
  const foundHazard = hazardKw.filter(kw => lower.includes(kw));
  const foundSeverity = SEVERITY_INDICATORS.filter(kw => lower.includes(kw));

  let score = Math.min(20, foundHazard.length * 6) + Math.min(10, foundSeverity.length * 5);

  // Enhance with local LLM
  try {
    const prompt = `Rate this landslide hazard report description on a scale of 0-30 for evidence severity.
Incident type: "${incidentType}"
Description: "${description}"
Reply ONLY with a JSON: {"score": number, "reason": "brief reason"}`;

    const text = await ollamaGenerate(TEXT_MODEL, prompt, [], 'json');
    const jsonStr = cleanJsonResponse(text);
    const parsed = JSON.parse(jsonStr);

    score = Math.max(score, Number(parsed.score) || 0);
    return { severity_score: Math.min(30, score), keywords_found: foundHazard, ai_reason: parsed.reason, ai_enhanced: true };
  } catch (e) {
    console.error('[ImageAI] Local text analysis failed:', e.message);
    // Fall through to rule-based result
  }

  return { severity_score: Math.min(30, score), keywords_found: foundHazard, ai_enhanced: false };
}

function neutralResult(incidentType, reason) {
  return {
    match: false,
    confidence: 0,
    detected_type: 'NOT_ANALYZED',
    ai_description: '',
    severity: 'LOW',
    visible_features: [],
    analyzed_at: new Date().toISOString(),
    source: reason,
    skipped: true
  };
}

module.exports = { analyzeIncidentImage, analyzeTextDescription };
`

---

## File: services/riskEngine.js
**Purpose:** 3-Layer risk calculation & Confidence engine with orbital verification  
**Path:** services/riskEngine.js

`javascript
const {
  RiskZone, WeatherData, SensorReading, SatelliteData, EarthquakeData,
  HistoricalEvent, CitizenReport, FieldReport, RiskPrediction
} = require('../db/models');

function levelFromScore(score) {
  if (score <= 25) return 'LOW';
  if (score <= 50) return 'MEDIUM';
  if (score <= 75) return 'HIGH';
  return 'CRITICAL';
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

// ---------- LAYER 1: STATIC SUSCEPTIBILITY ----------
async function computeStaticSusceptibility(zoneId) {
  const zone = await RiskZone.findById(zoneId);
  const histCount = await HistoricalEvent.countDocuments({ risk_zone_id: zoneId });

  const slopeScore = clamp((zone.slope_deg / 50) * 100);
  const historyScore = clamp(histCount * 20);
  const soilRisk = { 'Thin/Exposed': 90, 'Clayey': 70, 'Sandy-Loam': 45, 'Loamy': 25 }[zone.soil_type] ?? 40;
  const landCoverRisk = { 'Deforested Cut Slope': 90, 'Sparse Vegetation': 65, 'Mixed': 40, 'Cultivated': 25 }[zone.land_cover] ?? 40;

  const score = clamp(
    slopeScore * 0.35 +
    historyScore * 0.20 +
    soilRisk * 0.25 +
    landCoverRisk * 0.20
  );

  zone.static_susceptibility = score;
  await zone.save();

  return {
    score,
    components: {
      slope: { value: zone.slope_deg, contribution: slopeScore },
      historicalEvents: { value: histCount, contribution: historyScore },
      soilType: { value: zone.soil_type, contribution: soilRisk },
      landCover: { value: zone.land_cover, contribution: landCoverRisk }
    }
  };
}

// ---------- LAYER 2: DYNAMIC TRIGGER ANALYSIS ----------
async function computeDynamicTrigger(zoneId) {
  const weather = await WeatherData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 });
  const sensor = await SensorReading.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 });
  const sat = await SatelliteData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 });
  const eq = await EarthquakeData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 });

  const rainfallScore = clamp((weather.rainfall_24h / 200) * 100);
  const soilMoistureScore = clamp(sensor.soil_moisture);
  const groundMovementScore = clamp((sensor.ground_movement_mm / 20) * 100);
  // Dynamic Satellite calculation with Sentinel-2 & InSAR change detection
  let satelliteScore = 0;
  let satellitePassConfirmed = false;
  let satelliteDetail = 'No change detected';
  let satelliteBoost = 0;

  if (sat) {
    if (sat.change_detected) {
      satellitePassConfirmed = true;
      satelliteBoost = sat.confidence_boost || 16;
      const vegLossScore = clamp((sat.vegetation_loss_pct || 0) * 1.2);
      const scarScore = clamp(((sat.scar_area_sqm || 0) / 20000) * 100);
      const insarScore = clamp(((sat.surface_displacement_cm || 0) / 30) * 100);
      satelliteScore = clamp(vegLossScore * 0.40 + scarScore * 0.35 + insarScore * 0.25);
      satelliteDetail = `Scar: ${(sat.scar_area_sqm || 0).toLocaleString()} m² | NDVI: -${sat.vegetation_loss_pct}% | InSAR: ${sat.surface_displacement_cm} cm`;
    } else {
      satelliteScore = clamp((sat.surface_change || 2) * 5 + (sat.wetness_index || 20) * 0.5);
      satelliteDetail = `Stable: NDVI ${(sat.ndvi_current || 0.74).toFixed(2)} | InSAR: ${sat.surface_displacement_cm || 0.4} cm`;
    }
  }

  const seismicScore = clamp((eq ? (eq.magnitude / 6) * 100 * (eq.distance_km < 50 ? 1 : 0.4) : 10));

  const score = clamp(
    rainfallScore * 0.30 +
    soilMoistureScore * 0.25 +
    groundMovementScore * 0.25 +
    satelliteScore * 0.10 +
    seismicScore * 0.10
  );

  return {
    score,
    components: {
      rainfall24h: { value: weather?.rainfall_24h ?? 0, unit: 'mm', contribution: rainfallScore, source: weather?.source ?? 'SIMULATOR', status: weather?.status ?? 'SIMULATED' },
      soilMoisture: { value: sensor?.soil_moisture ?? 0, unit: '%', contribution: soilMoistureScore, source: sensor?.source ?? 'SIMULATOR', status: sensor?.status ?? 'SIMULATED' },
      groundMovement: { value: sensor?.ground_movement_mm ?? 0, unit: 'mm', contribution: groundMovementScore, source: sensor?.source ?? 'SIMULATOR', status: sensor?.status ?? 'SIMULATED' },
      satelliteSurfaceChange: {
        value: sat?.surface_change ?? 0,
        contribution: satelliteScore,
        detail: satelliteDetail,
        source: sat?.source ?? 'SENTINEL_COPERNICUS',
        status: sat?.status ?? 'DEMO DATA',
        confirmed: satellitePassConfirmed,
        boost: satelliteBoost,
        satRecord: sat ? sat.toJSON() : null
      },
      seismicActivity: { value: eq?.magnitude ?? 0, unit: 'Mw', contribution: seismicScore, source: eq?.source ?? 'MODELLED', status: eq?.status ?? 'MODELLED' },
      satellitePassConfirmed,
      satelliteConfidenceBoost: satelliteBoost
    }
  };
}

// ---------- LAYER 3: REAL-WORLD EVIDENCE (with AI image scoring) ----------
async function computeEvidence(zoneId) {
  const reports = await CitizenReport.find({ risk_zone_id: zoneId, status: { $ne: 'REJECTED' } }).sort({ created_at: -1 }).limit(10);
  const fieldReports = await FieldReport.find({ risk_zone_id: zoneId }).sort({ created_at: -1 }).limit(5);

  let score = 0;
  const weightByType = {
    'Landslide': 40, 'Mud Movement': 30, 'Rock Fall': 30, 'Ground Crack': 25,
    'Road Crack': 15, 'Blocked Road': 20, 'Flooding': 15, 'Other Hazard': 10
  };

  let imageMatchCount = 0;
  let imageMatchMaxConf = 0;
  let hasGpsReport = false;

  for (const r of reports) {
    // Base type weight
    score += weightByType[r.incident_type] ?? 10;

    // AI image match boost: adds up to 30 pts per matched image
    if (r.image_analysis && r.image_analysis.match && !r.image_analysis.skipped) {
      const imgConf = r.image_analysis.confidence || 0;
      const imgBoost = Math.round((imgConf / 100) * 30); // 0–30 pts scaled by AI confidence
      score += imgBoost;
      imageMatchCount++;
      imageMatchMaxConf = Math.max(imageMatchMaxConf, imgConf);
    }

    // Text analysis boost: adds up to 10 pts
    if (r.text_analysis && r.text_analysis.severity_score) {
      score += Math.min(10, r.text_analysis.severity_score);
    }

    // GPS-verified report boost (real location = more credible)
    if (r.latitude && r.longitude) {
      score += 5;
      hasGpsReport = true;
    }
  }

  let agentImageConfirmed = false;
  for (const f of fieldReports) {
    if (f.verification_result === 'CONFIRMED') {
      score += 35;
      // Agent photo AI confirmation: adds up to 25 pts extra
      if (f.image_analysis && f.image_analysis.match && !f.image_analysis.skipped) {
        const agentImgBoost = Math.round((f.image_analysis.confidence / 100) * 25);
        score += agentImgBoost;
        agentImageConfirmed = true;
      }
    } else if (f.verification_result === 'PARTIAL') {
      score += 15;
    }
  }

  score = clamp(score);

  return {
    score,
    citizenReportCount: reports.length,
    fieldVerificationCount: fieldReports.filter(f => f.verification_result === 'CONFIRMED').length,
    imageMatchCount,
    imageMatchMaxConf,
    hasGpsReport,
    agentImageConfirmed,
    reports: reports.map(r => ({
      id: r._id.toString(), type: r.incident_type, status: r.status, created_at: r.created_at,
      has_image: !!r.photo_base64, image_match: r.image_analysis?.match, image_conf: r.image_analysis?.confidence,
      has_gps: !!(r.latitude && r.longitude)
    })),
    fieldReports: fieldReports.map(f => ({
      id: f._id.toString(), result: f.verification_result, notes: f.notes,
      agent_image_match: f.image_analysis?.match, agent_image_conf: f.image_analysis?.confidence
    }))
  };
}

// ---------- CONFIDENCE ENGINE (image-aware) ----------
function computeConfidence({ dynamic, evidence, staticLayer }) {
  let sourcesAvailable = 0;
  let freshnessPoints = 0;
  const totalSources = 5;

  if (dynamic.components.rainfall24h.value != null) { sourcesAvailable++; if (dynamic.components.rainfall24h.status === 'LIVE') freshnessPoints++; }
  if (dynamic.components.soilMoisture.value != null) { sourcesAvailable++; if (dynamic.components.soilMoisture.status === 'LIVE') freshnessPoints++; }
  if (dynamic.components.satelliteSurfaceChange.value != null) sourcesAvailable++;
  if (dynamic.components.seismicActivity.value != null) sourcesAvailable++;
  sourcesAvailable++; // static always available

  const dataAvailability = (sourcesAvailable / totalSources) * 100;
  const freshness = (freshnessPoints / 2) * 100;
  const independentAgreement = clamp(100 - Math.abs(staticLayer.score - dynamic.score) * 0.5);
  const evidenceBoost = evidence.citizenReportCount > 0 ? 15 : 0;
  const fieldVerificationBoost = evidence.fieldVerificationCount > 0 ? 20 : 0;

  // NEW: AI image evidence boosts confidence significantly
  const imageMatchBoost = evidence.imageMatchCount > 0
    ? Math.round((evidence.imageMatchMaxConf / 100) * 18) // up to +18 if AI very confident
    : 0;
  const gpsBoost = evidence.hasGpsReport ? 5 : 0;
  const agentPhotoBoost = evidence.agentImageConfirmed ? 12 : 0;
  
  // NEW: Satellite orbital verification boost (Sentinel-2 & InSAR confirmation)
  const satelliteBoost = dynamic.components.satellitePassConfirmed
    ? Math.round(dynamic.components.satelliteConfidenceBoost || 16)
    : 0;

  let confidence = (
    dataAvailability * 0.26 +
    freshness * 0.12 +
    independentAgreement * 0.22 +
    (evidence.score > 0 ? 60 : 30) * 0.14
  ) + evidenceBoost * 0.3 + fieldVerificationBoost * 0.4
    + imageMatchBoost + gpsBoost + agentPhotoBoost + satelliteBoost;

  confidence = clamp(confidence, 20, 99);
  return Math.round(confidence);
}

// ---------- FUSION: FINAL RISK ----------
async function calculateRisk(zoneId) {
  const staticLayer = await computeStaticSusceptibility(zoneId);
  const dynamic = await computeDynamicTrigger(zoneId);
  const evidence = await computeEvidence(zoneId);

  const finalScore = clamp(
    staticLayer.score * 0.35 +
    dynamic.score * 0.45 +
    evidence.score * 0.20
  );

  const level = levelFromScore(finalScore);
  const confidence = computeConfidence({ dynamic, evidence, staticLayer });

  const factorCandidates = [
    { name: 'Rainfall (24h)', contribution: dynamic.components.rainfall24h.contribution, layer: 'DYNAMIC', detail: `${dynamic.components.rainfall24h.value} mm`, source: dynamic.components.rainfall24h.source, status: dynamic.components.rainfall24h.status },
    { name: 'Soil Moisture', contribution: dynamic.components.soilMoisture.contribution, layer: 'DYNAMIC', detail: `${dynamic.components.soilMoisture.value}%`, source: dynamic.components.soilMoisture.source, status: dynamic.components.soilMoisture.status },
    { name: 'Ground Movement', contribution: dynamic.components.groundMovement.contribution, layer: 'DYNAMIC', detail: `${dynamic.components.groundMovement.value} mm`, source: dynamic.components.groundMovement.source, status: dynamic.components.groundMovement.status },
    { name: 'Satellite Surface Change', contribution: dynamic.components.satelliteSurfaceChange.contribution, layer: 'DYNAMIC', detail: dynamic.components.satelliteSurfaceChange.detail || `index ${dynamic.components.satelliteSurfaceChange.value}`, source: dynamic.components.satelliteSurfaceChange.source, status: dynamic.components.satelliteSurfaceChange.status },
    { name: 'Seismic Activity', contribution: dynamic.components.seismicActivity.contribution, layer: 'DYNAMIC', detail: `${dynamic.components.seismicActivity.value} Mw`, source: dynamic.components.seismicActivity.source, status: dynamic.components.seismicActivity.status },
    { name: 'Slope', contribution: staticLayer.components.slope.contribution, layer: 'STATIC', detail: `${staticLayer.components.slope.value}°`, source: 'GIS/DEM', status: 'STATIC' },
    { name: 'Historical Landslides', contribution: staticLayer.components.historicalEvents.contribution, layer: 'STATIC', detail: `${staticLayer.components.historicalEvents.value} recorded events`, source: 'DISTRICT_RECORD', status: 'STATIC' },
    { name: 'Soil & Land Cover', contribution: (staticLayer.components.soilType.contribution + staticLayer.components.landCover.contribution) / 2, layer: 'STATIC', detail: `${staticLayer.components.soilType.value} / ${staticLayer.components.landCover.value}`, source: 'GSI', status: 'STATIC' },
    { name: 'Citizen Reports', contribution: evidence.citizenReportCount > 0 ? clamp(evidence.citizenReportCount * 20) : 0, layer: 'EVIDENCE', detail: `${evidence.citizenReportCount} report(s)`, source: 'CITIZEN', status: evidence.citizenReportCount > 0 ? 'LIVE' : 'NONE' },
    { name: 'Field Verification', contribution: evidence.fieldVerificationCount > 0 ? 90 : 0, layer: 'EVIDENCE', detail: `${evidence.fieldVerificationCount} confirmed`, source: 'FIELD_AGENT', status: evidence.fieldVerificationCount > 0 ? 'VERIFIED' : 'NONE' }
  ];

  const primaryFactors = factorCandidates
    .filter(f => f.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5)
    .map(f => ({ ...f, level: f.contribution >= 70 ? 'HIGH' : f.contribution >= 40 ? 'MEDIUM' : 'LOW' }));

  const prediction = await RiskPrediction.create({
    risk_zone_id: zoneId,
    static_score: staticLayer.score,
    dynamic_score: dynamic.score,
    evidence_score: evidence.score,
    final_score: finalScore,
    risk_level: level,
    confidence,
    factors: primaryFactors,
    evidence_summary: evidence
  });

  return {
    id: prediction._id.toString(),
    risk_zone_id: zoneId.toString(),
    riskZoneId: zoneId.toString(),
    staticScore: Math.round(staticLayer.score),
    dynamicScore: Math.round(dynamic.score),
    evidenceScore: Math.round(evidence.score),
    finalScore: Math.round(finalScore),
    riskLevel: level,
    confidence,
    primaryFactors,
    evidence,
    dataStatus: {
      weather: dynamic.components.rainfall24h.status,
      sensors: dynamic.components.soilMoisture.status,
      satellite: dynamic.components.satelliteSurfaceChange.status,
      seismic: dynamic.components.seismicActivity.status
    },
    createdAt: prediction.created_at
  };
}

async function getLatestPrediction(zoneId) {
  const p = await RiskPrediction.findOne({ risk_zone_id: zoneId }).sort({ created_at: -1 });
  if (!p) return null;
  const pj = p.toJSON();
  pj.factors = pj.factors || [];
  pj.evidence = pj.evidence_summary || {};
  return pj;
}

module.exports = { calculateRisk, getLatestPrediction, levelFromScore };
`

---

## File: services/impactEngine.js
**Purpose:** Vulnerability & infrastructure impact scoring  
**Path:** services/impactEngine.js

`javascript
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
`

---

## File: services/escalationJob.js
**Purpose:** Cron jobs: auto-escalation, predictive alerts, cluster detection  
**Path:** services/escalationJob.js

`javascript
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
`

---

## File: services/pipeline.js
**Purpose:** Closed-loop pipeline runner & WebSocket dispatcher  
**Path:** services/pipeline.js

`javascript
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
`

---

## File: services/weatherFetcher.js
**Purpose:** OpenWeatherMap integration & weather updater  
**Path:** services/weatherFetcher.js

`javascript
/**
 * weatherFetcher.js
 * Fetches live weather data from OpenWeatherMap for NER risk zone coordinates.
 * Falls back to 'ESTIMATED' status if API key is not set or call fails.
 */

const axios = require('axios');
const { WeatherData, RiskZone } = require('../db/models');

const OWM_KEY = process.env.OPENWEATHER_API_KEY;

if (!OWM_KEY) {
  console.warn('[Weather] OPENWEATHER_API_KEY not set — will use simulated data. Add key to .env for live weather.');
}

/**
 * Fetch current weather for a given lat/lng from OpenWeatherMap.
 * Returns normalized weather object or null on failure.
 */
async function fetchLiveWeather(lat, lng) {
  if (!OWM_KEY) return null;
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${OWM_KEY}&units=metric`;
    const { data } = await axios.get(url, { timeout: 5000 });
    return {
      temperature: data.main.temp,
      humidity: data.main.humidity,
      rainfall_1h: (data.rain?.['1h'] || 0),
      // OWM doesn't provide 24h directly in free tier — scale from 1h
      rainfall_24h: Math.round((data.rain?.['1h'] || 0) * 24 * 0.7), // conservative estimate
      rainfall_6h: Math.round((data.rain?.['1h'] || 0) * 6 * 0.8),
      rainfall_72h: Math.round((data.rain?.['1h'] || 0) * 72 * 0.5),
      rainfall_intensity: data.rain?.['1h'] > 10 ? 'HIGH' : data.rain?.['1h'] > 4 ? 'MEDIUM' : 'LOW',
      rainfall_trend: 'LIVE',
      source: 'OPENWEATHERMAP',
      status: 'LIVE',
      description: data.weather[0]?.description || '',
      wind_speed: data.wind?.speed || 0
    };
  } catch (err) {
    console.error('[Weather] OWM fetch failed for', lat, lng, ':', err.message);
    return null;
  }
}

/**
 * Refresh live weather for all risk zones that have coordinates.
 * Called periodically by escalationJob.
 */
async function refreshAllZoneWeather() {
  if (!OWM_KEY) return { skipped: true, reason: 'No API key' };

  const zones = await RiskZone.find({ latitude: { $exists: true, $ne: null } });
  let updated = 0, failed = 0;

  for (const zone of zones) {
    const live = await fetchLiveWeather(zone.latitude, zone.longitude);
    if (live) {
      await WeatherData.create({ risk_zone_id: zone._id, ...live });
      updated++;
    } else {
      failed++;
    }
    // Small delay to respect rate limits on free tier (60 calls/min)
    await new Promise(r => setTimeout(r, 1100));
  }

  return { updated, failed, total: zones.length };
}

module.exports = { fetchLiveWeather, refreshAllZoneWeather };
`

---

## File: services/pushService.js
**Purpose:** VAPID Web Push notification service  
**Path:** services/pushService.js

`javascript
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const { PushSubscription } = require('../db/models');

const KEYFILE = path.join(__dirname, '..', 'vapid-keys.json');

function loadOrCreateVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  if (fs.existsSync(KEYFILE)) {
    return JSON.parse(fs.readFileSync(KEYFILE, 'utf8'));
  }
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(KEYFILE, JSON.stringify(keys, null, 2));
  console.log('\n[Push] Generated new VAPID keypair -> vapid-keys.json');
  console.log('[Push] For a stable identity across restarts, copy these into your .env file:');
  console.log(`  VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`  VAPID_PRIVATE_KEY=${keys.privateKey}\n`);
  return keys;
}

const vapidKeys = loadOrCreateVapidKeys();
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@nerlirp.local';

webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);

function getPublicKey() {
  return vapidKeys.publicKey;
}

async function saveSubscription({ subscription, userId, deviceLabel, appRole, watchZoneId }) {
  const doc = await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      user_id: userId || null,
      device_label: deviceLabel || 'Unknown device',
      app_role: appRole,
      watch_zone_id: watchZoneId || null
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  return doc.toJSON();
}

async function removeSubscription(endpoint) {
  await PushSubscription.deleteOne({ endpoint });
}

// Send a real push notification to every device currently watching this zone,
// plus every GOVERNMENT/ADMIN device (command staff always sees everything).
async function sendAlertPush(zoneId, { title, body, level, zoneName }) {
  const subs = await PushSubscription.find({
    $or: [
      { watch_zone_id: zoneId },
      { app_role: { $in: ['GOVERNMENT', 'ADMIN'] } }
    ]
  });

  const payload = JSON.stringify({
    title, body, level, zoneName,
    icon: '/icons/icon-citizen-192.png',
    badge: '/icons/badge-72.png',
    timestamp: Date.now(),
    url: '/'
  });

  let sent = 0, failed = 0;
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
      sent++;
    } catch (err) {
      failed++;
      // 404/410 = subscription is dead (user uninstalled, permissions revoked, etc.) — clean it up
      if (err.statusCode === 404 || err.statusCode === 410) {
        await PushSubscription.deleteOne({ endpoint: sub.endpoint });
      }
    }
  }));

  return { sent, failed, targeted: subs.length };
}

module.exports = { getPublicKey, saveSubscription, removeSubscription, sendAlertPush };
`

---

## File: services/decisionEngine.js
**Purpose:** Action protocol generator based on risk and impact  
**Path:** services/decisionEngine.js

`javascript
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
`

---

## File: routes/satellite.js
**Purpose:** Orbital Earth Observation endpoints & bi-temporal change analysis  
**Path:** routes/satellite.js

`javascript
const express = require('express');
const { recordSatellitePass, processManualSatellitePass, getZoneSatelliteProfile, SATELLITE_SCENARIOS } = require('../services/satelliteService');
const { runPipeline, audit } = require('../services/pipeline');
const router = express.Router();

// Get satellite profile for a risk zone
router.get('/satellite/zones/:zoneId', async (req, res) => {
  try {
    const profile = await getZoneSatelliteProfile(req.params.zoneId);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger dynamic bi-temporal satellite change analysis
router.post('/satellite/analyze', async (req, res) => {
  const { risk_zone_id, scenario_type = 'CATASTROPHIC_SLIDE', custom_notes } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id is required' });

  try {
    const satRecord = await recordSatellitePass(risk_zone_id, scenario_type, custom_notes);

    await audit('SATELLITE_PASS_ANALYZED', 'satellite_data', {
      risk_zone_id, scenario_type,
      scar_area_sqm: satRecord.scar_area_sqm,
      vegetation_loss_pct: satRecord.vegetation_loss_pct,
      surface_displacement_cm: satRecord.surface_displacement_cm,
      change_detected: satRecord.change_detected
    });

    // Run pipeline to factor satellite change into risk score and boost confidence
    const pipeline = await runPipeline(risk_zone_id, {
      triggeredBy: 'SATELLITE_ORBITAL_PASS',
      reason: `Sentinel-2 & InSAR pass: ${satRecord.change_detected ? `Debris scar ${(satRecord.scar_area_sqm || 0).toLocaleString()} m² (-${satRecord.vegetation_loss_pct}% NDVI)` : 'Baseline stable'}`
    });

    res.json({
      satellite: satRecord,
      pipeline
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process custom manual satellite imagery (before & after) with AI analysis
router.post('/satellite/analyze-custom', async (req, res) => {
  const {
    risk_zone_id,
    before_image_base64,
    after_image_base64,
    before_image_url,
    after_image_url,
    custom_notes,
    client_metrics
  } = req.body;

  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id is required' });

  try {
    const satRecord = await processManualSatellitePass({
      zoneId: risk_zone_id,
      beforeImageBase64: before_image_base64,
      afterImageBase64: after_image_base64,
      beforeImageUrl: before_image_url,
      afterImageUrl: after_image_url,
      customNotes: custom_notes,
      clientMetrics: client_metrics
    });

    await audit('MANUAL_SATELLITE_ANALYZED', 'satellite_data', {
      risk_zone_id,
      scar_area_sqm: satRecord.scar_area_sqm,
      vegetation_loss_pct: satRecord.vegetation_loss_pct,
      surface_displacement_cm: satRecord.surface_displacement_cm,
      change_detected: satRecord.change_detected,
      custom_uploaded: true
    });

    const pipeline = await runPipeline(risk_zone_id, {
      triggeredBy: 'MANUAL_SATELLITE_ANALYSIS',
      reason: `Manual Sentinel pass analyzed: ${satRecord.change_detected ? `Debris scar ${(satRecord.scar_area_sqm || 0).toLocaleString()} m² (-${satRecord.vegetation_loss_pct}% NDVI)` : 'Baseline stable'}`
    });

    res.json({
      satellite: satRecord,
      pipeline
    });
  } catch (err) {
    console.error('[SatelliteRoute] Error analyzing custom satellite imagery:', err);
    res.status(500).json({ error: err.message });
  }
});

// List available satellite scenarios
router.get('/satellite/scenarios', (req, res) => {
  res.json(SATELLITE_SCENARIOS);
});

module.exports = router;
`

---

## File: routes/citizenReports.js
**Purpose:** Citizen report ingestion, Ollama AI trigger, photo serving  
**Path:** routes/citizenReports.js

`javascript
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
`

---

## File: routes/agents.js
**Purpose:** Field agent assignments, verification reports, navigation links  
**Path:** routes/agents.js

`javascript
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
`

---

## File: routes/alerts.js
**Purpose:** Emergency alerts CRUD and lifecycle  
**Path:** routes/alerts.js

`javascript
const express = require('express');
const { Alert, RiskZone, Village } = require('../db/models');
const router = express.Router();

router.get('/alerts', async (req, res) => {
  const { risk_zone_id, status } = req.query;
  const q = {};
  if (risk_zone_id) q.risk_zone_id = risk_zone_id;
  if (status) q.status = status;

  const rows = await Alert.find(q).sort({ created_at: -1 }).limit(100);
  const zoneIds = [...new Set(rows.map(r => r.risk_zone_id.toString()))];
  const zones = await RiskZone.find({ _id: { $in: zoneIds } });
  const zoneMap = Object.fromEntries(zones.map(z => [z._id.toString(), z]));
  const villageIds = [...new Set(zones.map(z => z.village_id.toString()))];
  const villages = await Village.find({ _id: { $in: villageIds } });
  const villageMap = Object.fromEntries(villages.map(v => [v._id.toString(), v]));

  res.json(rows.map(r => {
    const z = zoneMap[r.risk_zone_id.toString()];
    const v = z ? villageMap[z.village_id.toString()] : null;
    return { ...r.toJSON(), zone_name: z?.name, zone_code: z?.code, village_name: v?.name };
  }));
});

router.post('/alerts', async (req, res) => {
  const { risk_zone_id, level, title, description, recommended_action } = req.body;
  if (!risk_zone_id || !level || !title) return res.status(400).json({ error: 'risk_zone_id, level, title required' });
  const alert = await Alert.create({ risk_zone_id, level, title, description: description || '', recommended_action: recommended_action || '', status: 'ACTIVE' });
  res.status(201).json(alert.toJSON());
});

router.patch('/alerts/:id', async (req, res) => {
  const { status } = req.body;
  const valid = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'EXPIRED'];
  if (!valid.includes(status)) return res.status(400).json({ error: `status must be one of ${valid.join(', ')}` });
  const alert = await Alert.findByIdAndUpdate(req.params.id, { status }, { returnDocument: 'after' });
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert.toJSON());
});

module.exports = router;
`

---

## File: routes/simulation.js
**Purpose:** Sensor operator sliders and 15-step demo endpoints  
**Path:** routes/simulation.js

`javascript
const express = require('express');
const { MonitoringNode, WeatherData, SensorReading, SatelliteData, EarthquakeData, CitizenReport, FieldReport, User } = require('../db/models');
const { runPipeline } = require('../services/pipeline');
const router = express.Router();

async function getNode(zoneId) {
  return MonitoringNode.findOne({ risk_zone_id: zoneId });
}

// ---- Rainfall slider ----
router.post('/simulation/rainfall', async (req, res) => {
  const { risk_zone_id, rainfall_24h } = req.body;
  if (!risk_zone_id || rainfall_24h == null) return res.status(400).json({ error: 'risk_zone_id and rainfall_24h required' });

  const trend = rainfall_24h > 100 ? 'RISING' : rainfall_24h > 40 ? 'STABLE' : 'FALLING';
  const intensity = rainfall_24h > 120 ? 'HIGH' : rainfall_24h > 50 ? 'MEDIUM' : 'LOW';

  await WeatherData.create({
    risk_zone_id, rainfall_1h: Math.round(rainfall_24h / 8), rainfall_6h: Math.round(rainfall_24h / 3),
    rainfall_24h, rainfall_72h: rainfall_24h * 1.8, rainfall_intensity: intensity, rainfall_trend: trend,
    temperature: 21, humidity: 85, source: 'SIMULATOR', status: 'SIMULATED'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Rainfall set to ${rainfall_24h} mm (24h)` });
  res.json(result);
});

// ---- Soil moisture slider ----
router.post('/simulation/soil-moisture', async (req, res) => {
  const { risk_zone_id, soil_moisture } = req.body;
  if (!risk_zone_id || soil_moisture == null) return res.status(400).json({ error: 'risk_zone_id and soil_moisture required' });

  const node = await getNode(risk_zone_id);
  const prev = await SensorReading.findOne({ risk_zone_id }).sort({ timestamp: -1 });

  await SensorReading.create({
    monitoring_node_id: node?._id, risk_zone_id, soil_moisture,
    ground_movement_mm: prev?.ground_movement_mm ?? 0.5, tilt_deg: prev?.tilt_deg ?? 0.2,
    vibration: prev?.vibration ?? 0.1, source: 'SIMULATOR', status: 'SIMULATED'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Soil moisture set to ${soil_moisture}%` });
  res.json(result);
});

// ---- Ground movement slider ----
router.post('/simulation/ground-movement', async (req, res) => {
  const { risk_zone_id, ground_movement_mm } = req.body;
  if (!risk_zone_id || ground_movement_mm == null) return res.status(400).json({ error: 'risk_zone_id and ground_movement_mm required' });

  const node = await getNode(risk_zone_id);
  const prev = await SensorReading.findOne({ risk_zone_id }).sort({ timestamp: -1 });

  await SensorReading.create({
    monitoring_node_id: node?._id, risk_zone_id, soil_moisture: prev?.soil_moisture ?? 35,
    ground_movement_mm, tilt_deg: prev?.tilt_deg ?? 0.2, vibration: ground_movement_mm > 5 ? 2.5 : 0.1,
    source: 'SIMULATOR', status: 'SIMULATED'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Ground movement set to ${ground_movement_mm} mm` });
  res.json(result);
});

// ---- Satellite change toggle ----
router.post('/simulation/satellite-change', async (req, res) => {
  const { risk_zone_id, enabled } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  const { recordSatellitePass } = require('../services/satelliteService');
  const scenarioKey = enabled ? 'CATASTROPHIC_SLIDE' : 'BASELINE';
  const satRecord = await recordSatellitePass(risk_zone_id, scenarioKey);

  const result = await runPipeline(risk_zone_id, {
    triggeredBy: 'SENSOR_OPERATOR',
    reason: `Satellite pass (${scenarioKey}): ${satRecord.change_detected ? `Debris scar ${(satRecord.scar_area_sqm || 0).toLocaleString()} m² (-${satRecord.vegetation_loss_pct}% NDVI)` : 'Baseline stable'}`
  });
  res.json({ satellite: satRecord, pipeline: result });
});

// ---- Seismic activity ----
router.post('/simulation/seismic', async (req, res) => {
  const { risk_zone_id, magnitude, distance_km } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  await EarthquakeData.create({
    risk_zone_id, magnitude: magnitude ?? 2, distance_km: distance_km ?? 80, depth_km: 15,
    recent_seismic_activity: (magnitude ?? 2) > 4 ? 'ELEVATED' : 'LOW', source: 'SIMULATOR', status: 'SIMULATED'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Seismic event simulated: M${magnitude ?? 2}` });
  res.json(result);
});

// ---- Citizen report (simulator shortcut) ----
router.post('/simulation/citizen-report', async (req, res) => {
  const { risk_zone_id, incident_type = 'Road Crack', description = 'Simulated citizen report for demo' } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  const { RiskZone } = require('../db/models');
  const zone = await RiskZone.findById(risk_zone_id);
  const citizen = await User.findOne({ role: 'CITIZEN' });

  const report = await CitizenReport.create({
    risk_zone_id, user_id: citizen?._id ?? null, incident_type, description,
    latitude: zone.latitude, longitude: zone.longitude, photo_note: '[demo photo attached]', status: 'NEW', sync_status: 'SYNCED'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Citizen report: ${incident_type}` });
  res.json({ reportId: report._id.toString(), pipeline: result });
});

// ---- Field verification (simulator shortcut) ----
router.post('/simulation/field-verification', async (req, res) => {
  const { risk_zone_id, result: verificationResult = 'CONFIRMED', notes = 'Field verification confirmed via demo panel' } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  const agent = await User.findOne({ role: 'FIELD_AGENT' });
  const fieldReport = await FieldReport.create({
    risk_zone_id, agent_id: agent?._id ?? null, notes, verification_result: verificationResult, photo_note: '[demo field photo]'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Field verification: ${verificationResult}` });
  res.json({ fieldReportId: fieldReport._id.toString(), pipeline: result });
});

// ---- Reset a zone back to calm baseline ----
router.post('/simulation/reset', async (req, res) => {
  const { risk_zone_id } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  const node = await getNode(risk_zone_id);
  await WeatherData.create({ risk_zone_id, rainfall_1h: 2, rainfall_6h: 8, rainfall_24h: 40, rainfall_72h: 90, rainfall_intensity: 'LOW', rainfall_trend: 'STABLE', temperature: 22, humidity: 75, source: 'SIMULATOR', status: 'SIMULATED' });
  await SensorReading.create({ monitoring_node_id: node?._id, risk_zone_id, soil_moisture: 35, ground_movement_mm: 0.5, tilt_deg: 0.2, vibration: 0.1, source: 'SIMULATOR', status: 'SIMULATED' });
  await SatelliteData.create({ risk_zone_id, vegetation_change: 2, surface_change: 3, wetness_index: 20, land_disturbance: 5, source: 'SIMULATOR', status: 'SIMULATED' });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: 'Reset to baseline' });
  res.json(result);
});

module.exports = router;
`

---

## File: routes/risk.js
**Purpose:** Risk predictions and factor breakdowns  
**Path:** routes/risk.js

`javascript
const express = require('express');
const { RiskPrediction, ImpactAssessment } = require('../db/models');
const { getLatestPrediction } = require('../services/riskEngine');
const { runPipeline } = require('../services/pipeline');
const router = express.Router();

router.get('/risk-predictions', async (req, res) => {
  const preds = await RiskPrediction.find().sort({ created_at: -1 }).limit(100);
  res.json(preds.map(p => p.toJSON()));
});

router.get('/risk-zones/:id/risk', async (req, res) => {
  const latest = await getLatestPrediction(req.params.id);
  if (!latest) return res.status(404).json({ error: 'No prediction yet for this zone' });
  res.json(latest);
});

router.get('/risk-zones/:id/impact', async (req, res) => {
  const impact = await ImpactAssessment.findOne({ risk_zone_id: req.params.id }).sort({ created_at: -1 });
  if (!impact) return res.status(404).json({ error: 'No impact assessment yet' });
  res.json(impact.toJSON());
});

router.get('/impact-assessments', async (req, res) => {
  const rows = await ImpactAssessment.find().sort({ created_at: -1 }).limit(100);
  res.json(rows.map(r => r.toJSON()));
});

router.post('/risk/calculate', async (req, res) => {
  const { risk_zone_id } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });
  const result = await runPipeline(risk_zone_id, { triggeredBy: 'MANUAL_API', reason: 'Manual recalculation requested' });
  res.json(result);
});

module.exports = router;
`

---

## File: routes/locations.js
**Purpose:** State, district, village, and risk zone endpoints  
**Path:** routes/locations.js

`javascript
const express = require('express');
const { State, District, Village, RiskZone, RiskPrediction } = require('../db/models');
const router = express.Router();

router.get('/states', async (req, res) => {
  res.json((await State.find()).map(s => s.toJSON()));
});

router.get('/districts', async (req, res) => {
  const { state_id } = req.query;
  const q = state_id ? { state_id } : {};
  res.json((await District.find(q)).map(d => d.toJSON()));
});

router.get('/villages', async (req, res) => {
  const { district_id } = req.query;
  const q = district_id ? { district_id } : {};
  res.json((await Village.find(q)).map(v => v.toJSON()));
});

router.get('/risk-zones', async (req, res) => {
  const { village_id } = req.query;
  const q = village_id ? { village_id } : {};
  const zones = await RiskZone.find(q);

  const enriched = await Promise.all(zones.map(async (z) => {
    const latest = await RiskPrediction.findOne({ risk_zone_id: z._id }).sort({ created_at: -1 })
      .select('risk_level final_score confidence created_at');
    const zj = z.toJSON();
    zj.latestRisk = latest ? {
      risk_level: latest.risk_level, final_score: latest.final_score,
      confidence: latest.confidence, created_at: latest.created_at
    } : null;
    return zj;
  }));
  res.json(enriched);
});

router.get('/risk-zones/:id', async (req, res) => {
  const zone = await RiskZone.findById(req.params.id);
  if (!zone) return res.status(404).json({ error: 'Risk zone not found' });
  const village = await Village.findById(zone.village_id);
  res.json({ ...zone.toJSON(), village: village ? village.toJSON() : null });
});

module.exports = router;
`

---

## File: routes/weather.js
**Purpose:** Zone weather readings and refresh endpoint  
**Path:** routes/weather.js

`javascript
const express = require('express');
const { WeatherData } = require('../db/models');
const { runPipeline } = require('../services/pipeline');
const router = express.Router();

router.get('/weather', async (req, res) => {
  const { risk_zone_id } = req.query;
  const q = risk_zone_id ? { risk_zone_id } : {};
  const rows = await WeatherData.find(q).sort({ timestamp: -1 }).limit(risk_zone_id ? 20 : 50);
  res.json(rows.map(r => r.toJSON()));
});

// Real-world weather API ingestion endpoint (production extensibility)
router.post('/weather/ingest', async (req, res) => {
  const { risk_zone_id, rainfall_1h, rainfall_6h, rainfall_24h, rainfall_72h, temperature, humidity, source = 'WEATHER_API' } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  const trend = rainfall_24h > 100 ? 'RISING' : rainfall_24h > 40 ? 'STABLE' : 'FALLING';
  const intensity = rainfall_1h > 30 ? 'HIGH' : rainfall_1h > 10 ? 'MEDIUM' : 'LOW';

  await WeatherData.create({
    risk_zone_id, rainfall_1h, rainfall_6h, rainfall_24h, rainfall_72h,
    rainfall_intensity: intensity, rainfall_trend: trend, temperature, humidity, source, status: 'LIVE'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'WEATHER_INGEST', reason: 'New weather data ingested' });
  res.json({ ingested: true, pipeline: result });
});

module.exports = router;
`

---

## File: routes/monitoring.js
**Purpose:** Monitoring nodes and sensor readings  
**Path:** routes/monitoring.js

`javascript
const express = require('express');
const { RiskZone, MonitoringNode, WeatherData, SensorReading, SatelliteData, EarthquakeData, HistoricalEvent } = require('../db/models');
const router = express.Router();

router.get('/monitoring-nodes', async (req, res) => {
  const { risk_zone_id } = req.query;
  const q = risk_zone_id ? { risk_zone_id } : {};
  res.json((await MonitoringNode.find(q)).map(n => n.toJSON()));
});

router.get('/monitoring-nodes/:id', async (req, res) => {
  const node = await MonitoringNode.findById(req.params.id);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  const zoneId = node.risk_zone_id;
  const [weather, sensor, satellite, earthquake] = await Promise.all([
    WeatherData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    SensorReading.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    SatelliteData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    EarthquakeData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 })
  ]);
  res.json({
    node: node.toJSON(),
    weather: weather ? weather.toJSON() : null,
    sensor: sensor ? sensor.toJSON() : null,
    satellite: satellite ? satellite.toJSON() : null,
    earthquake: earthquake ? earthquake.toJSON() : null
  });
});

// Full "digital environmental profile" for a zone
router.get('/risk-zones/:id/profile', async (req, res) => {
  const zoneId = req.params.id;
  const zone = await RiskZone.findById(zoneId);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });

  const [node, weather, sensor, satellite, earthquake, historicalEvents] = await Promise.all([
    MonitoringNode.findOne({ risk_zone_id: zoneId }),
    WeatherData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    SensorReading.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    SatelliteData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    EarthquakeData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    HistoricalEvent.find({ risk_zone_id: zoneId })
  ]);

  res.json({
    zone: zone.toJSON(),
    node: node ? node.toJSON() : null,
    weather: weather ? weather.toJSON() : null,
    sensor: sensor ? sensor.toJSON() : null,
    satellite: satellite ? satellite.toJSON() : null,
    earthquake: earthquake ? earthquake.toJSON() : null,
    historicalEvents: historicalEvents.map(h => h.toJSON())
  });
});

module.exports = router;
`

---

## File: routes/auth.js
**Purpose:** User authentication and profile  
**Path:** routes/auth.js

`javascript
const express = require('express');
const { User } = require('../db/models');
const { hash, verify } = require('../db/simpleHash');
const { audit } = require('../services/pipeline');
const router = express.Router();

// NOTE: This demo issues a simple opaque token (the user's Mongo _id) instead
// of a real JWT/session store, to keep the prototype dependency-free. Swap for
// signed JWTs + refresh tokens before internet-facing production use.

router.post('/auth/register', async (req, res) => {
  const { name, email, password, role = 'CITIZEN', phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  const validRoles = ['ADMIN', 'GOVERNMENT', 'FIELD_AGENT', 'CITIZEN'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: `role must be one of ${validRoles.join(', ')}` });

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const user = await User.create({ name, email, password_hash: hash(password), role, phone: phone || null });
  await audit('USER_REGISTERED', 'user', { id: user._id.toString(), email, role });
  res.status(201).json({ token: user._id.toString(), user: { id: user._id.toString(), name, email, role } });
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase() });
  if (!user || !verify(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });

  await audit('USER_LOGIN', 'user', { id: user._id.toString(), email }, user._id);
  res.json({
    token: user._id.toString(),
    user: {
      id: user._id.toString(), name: user.name, email: user.email, role: user.role,
      agent_status: user.agent_status, home_risk_zone: user.home_risk_zone
    }
  });
});

router.post('/auth/logout', (req, res) => res.json({ ok: true }));

router.get('/auth/profile', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const user = await User.findById(token).select('name email role phone agent_status home_risk_zone');
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  res.json(user.toJSON());
});

module.exports = router;
`

---

## File: routes/analytics.js
**Purpose:** Zone statistics and historical analytics  
**Path:** routes/analytics.js

`javascript
const express = require('express');
const { RiskZone, RiskPrediction, WeatherData, Alert, CitizenReport, AgentAssignment, AuditLog, DataSource, User } = require('../db/models');
const router = express.Router();

router.get('/analytics/summary', async (req, res) => {
  const zones = await RiskZone.find().select('_id');
  let low = 0, medium = 0, high = 0, critical = 0;

  await Promise.all(zones.map(async (z) => {
    const latest = await RiskPrediction.findOne({ risk_zone_id: z._id }).sort({ created_at: -1 }).select('risk_level');
    const level = latest?.risk_level || 'LOW';
    if (level === 'LOW') low++; else if (level === 'MEDIUM') medium++; else if (level === 'HIGH') high++; else critical++;
  }));

  const [activeAlerts, pendingReports, activeOperations] = await Promise.all([
    Alert.countDocuments({ status: 'ACTIVE' }),
    CitizenReport.countDocuments({ status: { $in: ['NEW', 'UNDER REVIEW'] } }),
    AgentAssignment.countDocuments({ status: { $ne: 'COMPLETED' } })
  ]);

  res.json({ totalZones: zones.length, low, medium, high, critical, activeAlerts, pendingReports, activeOperations });
});

router.get('/analytics/risk-trend', async (req, res) => {
  const { risk_zone_id, limit = 50 } = req.query;
  const q = risk_zone_id ? { risk_zone_id } : {};
  const rows = await RiskPrediction.find(q).sort({ created_at: 1 }).limit(Number(limit))
    .select('final_score risk_level confidence created_at risk_zone_id');
  res.json(rows.map(r => r.toJSON()));
});

router.get('/analytics/rainfall-trend', async (req, res) => {
  const { risk_zone_id, limit = 50 } = req.query;
  const q = risk_zone_id ? { risk_zone_id } : {};
  const rows = await WeatherData.find(q).sort({ timestamp: 1 }).limit(Number(limit)).select('rainfall_24h timestamp risk_zone_id');
  res.json(rows.map(r => r.toJSON()));
});

router.get('/audit-logs', async (req, res) => {
  const rows = await AuditLog.find().sort({ created_at: -1 }).limit(200);
  res.json(rows.map(r => r.toJSON()));
});

router.get('/data-sources', async (req, res) => {
  res.json((await DataSource.find()).map(d => d.toJSON()));
});

router.get('/users', async (req, res) => {
  const rows = await User.find().select('name email role phone status agent_status created_at');
  res.json(rows.map(r => r.toJSON()));
});

module.exports = router;
`

---

## File: routes/push.js
**Purpose:** VAPID public key and device subscription endpoint  
**Path:** routes/push.js

`javascript
const express = require('express');
const { getPublicKey, saveSubscription, removeSubscription, sendAlertPush } = require('../services/pushService');
const { User } = require('../db/models');
const router = express.Router();

router.get('/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: getPublicKey() });
});

// Body: { subscription: PushSubscriptionJSON, userId?, deviceLabel, appRole, watchZoneId? }
router.post('/push/subscribe', async (req, res) => {
  const { subscription, userId, deviceLabel, appRole, watchZoneId } = req.body;
  if (!subscription || !subscription.endpoint || !appRole) {
    return res.status(400).json({ error: 'subscription and appRole are required' });
  }
  const saved = await saveSubscription({ subscription, userId, deviceLabel, appRole, watchZoneId });
  res.status(201).json(saved);
});

router.post('/push/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  await removeSubscription(endpoint);
  res.json({ ok: true });
});

// Manual test button in the UI hits this to prove push actually reaches the device
router.post('/push/test', async (req, res) => {
  const { watch_zone_id } = req.body;
  if (!watch_zone_id) return res.status(400).json({ error: 'watch_zone_id required' });
  const result = await sendAlertPush(watch_zone_id, {
    title: 'NER-LIRP Test Alert',
    body: 'This is a real push notification test from the platform.',
    level: 'INFO',
    zoneName: 'Test'
  });
  res.json(result);
});

module.exports = router;
`

---

## File: public/launcher.html
**Purpose:** Mobile launcher screen for Citizen and Field Agent roles  
**Path:** public/launcher.html

`html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NER-LIRP</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body style="background:var(--paper-dim);">

<div class="phone-shell" style="box-shadow:0 0 40px rgba(0,0,0,0.08);">
  <div class="phone-header">
    <div class="phone-header__title">NER-LIRP</div>
    <div class="phone-header__sub">Choose how you're using this device</div>
  </div>

  <div class="phone-body">

    <div class="card">
      <div class="card__head"><h2>Real Alerts for This Phone</h2></div>
      <p class="muted" style="font-size:11.5px;margin-top:-4px;">
        Pick the zone nearest to where you live or are stationed. If that zone's risk
        reaches WARNING level or above, a real notification will appear on this phone's
        lock screen — even if the app isn't open.
      </p>
      <select id="zone-select" style="margin-bottom:10px;"></select>
      <button class="btn btn-outline" id="btn-enable-push" style="width:100%;">🔔 Enable Real Alerts for This Area</button>
      <div class="muted" id="push-status" style="font-size:11px;margin-top:6px;">Not enabled yet</div>
    </div>

    <div class="card" style="text-align:center;padding:28px 16px;cursor:pointer;" id="go-citizen">
      <div style="font-size:34px;">🏠</div>
      <h2 style="margin:8px 0 2px;">Citizen Mode</h2>
      <p class="muted" style="font-size:12px;margin:0;">Report incidents, view local risk &amp; alerts</p>
    </div>

    <div class="card" style="text-align:center;padding:28px 16px;cursor:pointer;" id="go-agent">
      <div style="font-size:34px;">🧭</div>
      <h2 style="margin:8px 0 2px;">Field Agent Mode</h2>
      <p class="muted" style="font-size:12px;margin:0;">View assignments &amp; submit field verification</p>
    </div>

    <div class="card">
      <div class="card__head"><h2>Send a Test Alert</h2></div>
      <p class="muted" style="font-size:11.5px;margin-top:-4px;">Confirms push notifications are actually reaching this device.</p>
      <button class="btn btn-outline" id="btn-test-push" style="width:100%;">Send Test Notification</button>
    </div>

  </div>
</div>

<div id="toast-stack"></div>

<script src="js/common.js"></script>
<script src="js/push-client.js"></script>
<script>
registerManifest('manifest-citizen.json', '#173f2b');

let lZoneId = null;

(async function loadZones() {
  const zones = await apiGet('/risk-zones');
  const sel = document.getElementById('zone-select');
  sel.innerHTML = zones.map(z => `<option value="${z.id}">${z.code} · ${z.name}</option>`).join('');
  sel.addEventListener('change', () => { lZoneId = sel.value; });
  lZoneId = zones[0]?.id;
})();

document.getElementById('btn-enable-push').addEventListener('click', async () => {
  const result = await enablePushNotifications({ appRole: 'CITIZEN', watchZoneId: lZoneId, deviceLabel: 'Citizen/Agent phone' });
  const statusEl = document.getElementById('push-status');
  if (result.ok) {
    statusEl.textContent = '✅ Enabled — you will get real alerts for this zone';
    toast('Push notifications enabled');
  } else {
    statusEl.textContent = '❌ ' + result.reason;
    toast(result.reason, 'critical');
  }
});

document.getElementById('btn-test-push').addEventListener('click', async () => {
  if (!lZoneId) return toast('Select a zone first', 'warning');
  const r = await apiPost('/push/test', { watch_zone_id: lZoneId });
  toast(r.sent > 0 ? `Test sent to ${r.sent} device(s)` : 'No subscribed devices found for this zone — enable push first', r.sent > 0 ? 'info' : 'warning');
});

document.getElementById('go-citizen').addEventListener('click', () => location.href = 'citizen.html');
document.getElementById('go-agent').addEventListener('click', () => location.href = 'agent.html');
</script>
</body>
</html>
`

---

## File: public/citizen.html
**Purpose:** Citizen mobile reporting interface  
**Path:** public/citizen.html

`html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<meta name="description" content="NER-LIRP Citizen App — Report landslide hazards in Northeast India">
<title>NER-LIRP · Citizen App</title>
<link rel="stylesheet" href="css/style.css">
<style>
.photo-preview { width:100%; max-height:200px; object-fit:cover; border-radius:4px; border:1px solid var(--line); margin-bottom:8px; display:none; }
.ai-result { padding:10px; border-radius:4px; font-size:12px; margin-top:8px; }
.ai-result.match { background:var(--green-soft); border:1px solid var(--green); color:var(--green); }
.ai-result.no-match { background:var(--orange-soft); border:1px solid var(--orange); color:var(--orange); }
.ai-result.pending { background:var(--amber-soft); border:1px solid var(--amber); color:var(--amber); }
.gps-badge { display:inline-flex; gap:6px; align-items:center; font-size:11.5px; padding:5px 10px; border-radius:4px; background:var(--green-soft); color:var(--green); font-weight:600; margin-bottom:8px; }
.camera-btn { width:100%; padding:12px; background:var(--ink-900); color:#fff; border:none; border-radius:4px; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:8px; }
.camera-btn:hover { filter:brightness(1.15); }
.report-card { background:#fff; border:1px solid var(--line); border-radius:4px; padding:12px; margin-bottom:8px; font-size:12px; }
.img-thumb { width:48px; height:48px; object-fit:cover; border-radius:3px; border:1px solid var(--line); flex-shrink:0; }
</style>
</head>
<body style="background:var(--paper-dim);">

<div class="phone-shell" style="box-shadow:0 0 40px rgba(0,0,0,0.08);">
  <div class="phone-header">
    <div class="phone-header__title">NER-LIRP</div>
    <div class="phone-header__sub" id="citizen-location">Citizen App · Loading…</div>
  </div>

  <div class="phone-body">

    <!-- LOGIN -->
    <div id="screen-login">
      <div class="card">
        <div class="card__head"><h2>Citizen Login</h2></div>
        <label class="field-label">Email</label>
        <input type="email" id="login-email" value="citizen@example.com" style="margin-bottom:8px;">
        <label class="field-label">Password</label>
        <input type="password" id="login-password" value="demo1234" style="margin-bottom:12px;">
        <button class="btn btn-primary" id="btn-login" style="width:100%;">Login</button>
        <p class="muted" style="font-size:11px;margin-top:10px;">Demo credentials pre-filled.</p>
      </div>
    </div>

    <!-- HOME -->
    <div id="screen-home" style="display:none;">
      <div class="risk-hero" id="risk-hero">
        <div class="muted" style="color:#cdd9df;font-size:11px;">YOUR AREA RISK</div>
        <div class="risk-hero__level" id="hero-level">—</div>
        <div class="risk-hero__sub" id="hero-sub">Loading zone data…</div>
      </div>

      <div class="card">
        <div class="card__head"><h2>Nearby Risk Zones</h2></div>
        <div id="citizen-zones"></div>
      </div>

      <div class="card">
        <div class="card__head"><h2>Active Alerts</h2></div>
        <div id="citizen-alerts"><div class="empty-state">No active alerts</div></div>
      </div>

      <div class="card">
        <div class="card__head"><h2>🔔 Real Phone Alerts</h2></div>
        <button class="btn btn-outline" id="btn-enable-push" style="width:100%;">Enable Real Alerts for My Area</button>
        <div class="muted" id="push-status" style="font-size:11px;margin-top:6px;">Not enabled — you won't get lock-screen alerts</div>
      </div>

      <button class="btn btn-danger" id="btn-quick-report" style="width:100%;margin-bottom:8px;padding:14px;font-size:14px;">⚠ Report a Hazard</button>
    </div>

    <!-- REPORT INCIDENT -->
    <div id="screen-report" style="display:none;">
      <div class="card">
        <div class="card__head"><h2>Report Hazard</h2></div>

        <label class="field-label">Zone</label>
        <select id="report-zone" style="margin-bottom:10px;"></select>

        <label class="field-label">Incident Type</label>
        <div class="incident-grid" id="incident-grid" style="margin-bottom:10px;"></div>

        <label class="field-label">Description</label>
        <textarea id="report-description" placeholder="Describe what you observed…" style="margin-bottom:10px;"></textarea>

        <!-- GPS Section -->
        <label class="field-label">📍 GPS Location</label>
        <div id="gps-status" class="muted" style="margin-bottom:6px;font-size:11.5px;">Not captured</div>
        <button class="btn btn-outline btn-sm" id="btn-capture-gps" style="margin-bottom:10px;">📍 Capture My Location</button>
        <div id="gps-badge-container"></div>

        <!-- Photo Section -->
        <label class="field-label">📷 Photo Evidence</label>
        <!-- Hidden file inputs for camera and gallery -->
        <input type="file" id="photo-camera" accept="image/*" capture="environment" style="display:none;">
        <input type="file" id="photo-gallery" accept="image/*" style="display:none;">
        <img id="photo-preview" class="photo-preview" alt="Photo preview">
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <button class="camera-btn" id="btn-take-photo" style="flex:1;">📷 Camera</button>
          <button class="camera-btn" id="btn-pick-photo" style="flex:1;background:var(--ink-700);">🖼 Gallery</button>
        </div>
        <div id="ai-analysis-result" style="display:none;"></div>

        <div id="offline-banner" style="display:none;background:var(--amber-soft);color:var(--amber);padding:8px;border-radius:3px;font-size:11.5px;margin-bottom:10px;">
          You're offline — this report will be queued and synced when connection returns.
        </div>

        <button class="btn btn-primary" id="btn-submit-report" style="width:100%;padding:13px;font-size:13px;">Submit Report</button>
        <button class="btn btn-outline" id="btn-cancel-report" style="width:100%;margin-top:6px;">Cancel</button>
      </div>
    </div>

    <!-- MY REPORTS -->
    <div id="screen-myreports" style="display:none;">
      <div class="card">
        <div class="card__head"><h2>My Reports</h2></div>
        <div id="my-reports-list"><div class="empty-state">No reports submitted yet</div></div>
      </div>
    </div>

    <!-- SAFETY -->
    <div id="screen-safety" style="display:none;">
      <div class="card">
        <div class="card__head"><h2>🛟 Safety Guidelines</h2></div>
        <ul style="font-size:12.5px;line-height:1.9;padding-left:18px;">
          <li>Move away from steep slopes during or after heavy rainfall.</li>
          <li>Watch for new cracks in ground, walls, or roads — report immediately.</li>
          <li>If you hear rumbling or see trees tilting, evacuate uphill immediately.</li>
          <li>Keep emergency contacts saved and devices charged.</li>
          <li>Follow government alerts and field agent instructions without delay.</li>
          <li>Never re-enter an area after a landslide without official clearance.</li>
        </ul>
      </div>
      <div class="card" style="background:var(--red-soft);border-color:var(--red);">
        <strong style="color:var(--red);">Emergency Numbers</strong>
        <div style="margin-top:8px;font-size:13px;line-height:1.8;">
          🚨 NDRF: <strong>1078</strong><br>
          🏥 Ambulance: <strong>108</strong><br>
          🚒 Fire: <strong>101</strong><br>
          👮 Police: <strong>100</strong>
        </div>
      </div>
    </div>

  </div>

  <div class="phone-tabbar">
    <button data-screen="home" class="active">🏠<br>Home</button>
    <button data-screen="report">⚠<br>Report</button>
    <button data-screen="myreports">📋<br>My Reports</button>
    <button data-screen="safety">🛟<br>Safety</button>
  </div>
</div>

<div id="toast-stack"></div>

<script src="/socket.io/socket.io.js"></script>
<script src="js/common.js"></script>
<script src="js/push-client.js"></script>
<script src="js/citizen.js"></script>
</body>
</html>
`

---

## File: public/agent.html
**Purpose:** Field Agent response and verification interface  
**Path:** public/agent.html

`html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<meta name="description" content="NER-LIRP Field Agent App — Field verification for landslide emergency response">
<title>NER-LIRP · Field Agent</title>
<link rel="stylesheet" href="css/style.css">
<style>
.photo-preview { width:100%; max-height:220px; object-fit:cover; border-radius:4px; border:1px solid var(--line); margin-bottom:8px; display:none; }
.citizen-photo { width:100%; max-height:160px; object-fit:cover; border-radius:4px; border:2px solid var(--amber); margin-bottom:8px; }
.ai-result { padding:10px; border-radius:4px; font-size:12px; margin-top:8px; }
.ai-result.match { background:var(--green-soft); border:1px solid var(--green); color:var(--green); }
.ai-result.no-match { background:var(--orange-soft); border:1px solid var(--orange); color:var(--orange); }
.ai-result.pending { background:var(--amber-soft); border:1px solid var(--amber); color:var(--amber); }
.gps-badge { display:inline-flex; gap:6px; align-items:center; font-size:11.5px; padding:5px 10px; border-radius:4px; background:var(--green-soft); color:var(--green); font-weight:600; margin-bottom:8px; }
.camera-btn { width:100%; padding:11px; background:var(--ink-900); color:#fff; border:none; border-radius:4px; font-size:12.5px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:8px; }
.conf-chain { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-top:10px; }
.conf-item { text-align:center; padding:8px; background:var(--paper-dim); border-radius:4px; font-size:11px; }
.conf-item__val { font-size:18px; font-weight:700; font-family:var(--font-display); }
.conf-item__val.up { color:var(--green); }
</style>
</head>
<body style="background:var(--paper-dim);">

<div class="phone-shell" style="box-shadow:0 0 40px rgba(0,0,0,0.08);">
  <div class="phone-header">
    <div class="phone-header__title">NER-LIRP Field Agent</div>
    <div class="phone-header__sub" id="agent-name-sub">Not logged in</div>
  </div>

  <div class="phone-body">

    <!-- LOGIN -->
    <div id="screen-login">
      <div class="card">
        <div class="card__head"><h2>Agent Login</h2></div>
        <label class="field-label">Email</label>
        <select id="login-email" style="margin-bottom:8px;">
          <option value="agent1@nerlirp.gov.in">agent1@nerlirp.gov.in (Agent Dorji)</option>
          <option value="agent2@nerlirp.gov.in">agent2@nerlirp.gov.in (Agent Lyngdoh)</option>
          <option value="agent3@nerlirp.gov.in">agent3@nerlirp.gov.in (Agent Bora)</option>
        </select>
        <label class="field-label">Password</label>
        <input type="password" id="login-password" value="demo1234" style="margin-bottom:12px;">
        <button class="btn btn-primary" id="btn-login" style="width:100%;">Login</button>
      </div>
    </div>

    <!-- DASHBOARD -->
    <div id="screen-dashboard" style="display:none;">
      <div class="card">
        <div class="card__head"><h2>My Status</h2></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm status-btn" data-status="AVAILABLE">✅ Available</button>
          <button class="btn btn-outline btn-sm status-btn" data-status="OFFLINE">🔴 Offline</button>
        </div>
        <div class="muted" style="margin-top:8px;font-size:11.5px;">Current: <span id="agent-current-status">—</span></div>
      </div>
      <div class="card">
        <div class="card__head"><h2>🔔 Real Phone Alerts</h2></div>
        <button class="btn btn-outline" id="btn-enable-push" style="width:100%;">Enable Real Alerts on This Phone</button>
        <div class="muted" id="push-status" style="font-size:11px;margin-top:6px;">Not enabled yet</div>
      </div>
      <div class="card">
        <div class="card__head"><h2>Active Assignments</h2></div>
        <div id="assignments-list"><div class="empty-state">No assignments</div></div>
      </div>
    </div>

    <!-- ASSIGNMENT DETAIL -->
    <div id="screen-detail" style="display:none;">
      <div class="card" id="detail-card"></div>
    </div>

    <!-- FIELD VERIFICATION -->
    <div id="screen-verify" style="display:none;">
      <div class="card">
        <div class="card__head"><h2>Field Verification</h2></div>
        <div class="muted" id="verify-zone-name" style="margin-bottom:8px;font-weight:600;"></div>

        <!-- Citizen's original photo (if available) -->
        <div id="citizen-evidence" style="display:none;margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;margin-bottom:4px;">Citizen Report Photo:</div>
          <img id="citizen-photo-img" class="citizen-photo" alt="Citizen reported photo">
          <div id="citizen-ai-note" style="font-size:11px;color:var(--slate-500);margin-bottom:4px;"></div>
        </div>

        <label class="field-label">Verification Result</label>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <div class="incident-btn" data-result="CONFIRMED" style="flex:1;background:var(--green-soft);">✅ Confirmed</div>
          <div class="incident-btn" data-result="PARTIAL" style="flex:1;background:var(--amber-soft);">⚠ Partial</div>
          <div class="incident-btn" data-result="FALSE_ALARM" style="flex:1;background:var(--red-soft);">❌ False Alarm</div>
        </div>

        <label class="field-label">Field Notes</label>
        <textarea id="verify-notes" placeholder="On-site observations, severity, hazard extent…" style="margin-bottom:10px;min-height:80px;"></textarea>

        <!-- Real GPS at site -->
        <label class="field-label">📍 Your GPS at Site</label>
        <div id="agent-gps-status" class="muted" style="font-size:11.5px;margin-bottom:6px;">Not captured</div>
        <button class="btn btn-outline btn-sm" id="btn-agent-gps" style="margin-bottom:10px;">📍 Capture Site Location</button>
        <div id="agent-gps-badge"></div>

        <!-- Real photo upload -->
        <label class="field-label">📷 Field Evidence Photo</label>
        <input type="file" id="verify-camera" accept="image/*" capture="environment" style="display:none;">
        <input type="file" id="verify-gallery" accept="image/*" style="display:none;">
        <img id="verify-photo-preview" class="photo-preview" alt="Field evidence preview">
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <button class="camera-btn" id="btn-verify-camera" style="flex:1;">📷 Take Photo</button>
          <button class="camera-btn" id="btn-verify-gallery" style="flex:1;background:var(--ink-700);">🖼 Gallery</button>
        </div>
        <div id="verify-ai-result" style="display:none;"></div>

        <!-- Confidence chain preview -->
        <div id="conf-chain" style="display:none;margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;margin-bottom:6px;">How your verification affects confidence:</div>
          <div class="conf-chain">
            <div class="conf-item"><div class="conf-item__val" id="cc-before">—</div><div>Before</div></div>
            <div class="conf-item"><div style="font-size:20px;">→</div></div>
            <div class="conf-item"><div class="conf-item__val up" id="cc-after">—</div><div>Expected</div></div>
          </div>
        </div>

        <div id="agent-offline-banner" style="display:none;background:var(--amber-soft);color:var(--amber);padding:8px;border-radius:3px;font-size:11.5px;margin-bottom:10px;">
          Offline — verification will sync automatically once connection returns.
        </div>

        <button class="btn btn-primary" id="btn-submit-verification" style="width:100%;padding:13px;font-size:13px;">Submit Verification</button>
        <button class="btn btn-outline" id="btn-cancel-verify" style="width:100%;margin-top:6px;">Back</button>
      </div>
    </div>

    <!-- OFFLINE QUEUE -->
    <div id="screen-offline" style="display:none;">
      <div class="card">
        <div class="card__head"><h2>Offline Queue</h2></div>
        <div id="agent-offline-list"><div class="empty-state">No pending items</div></div>
      </div>
    </div>

  </div>

  <div class="phone-tabbar">
    <button data-screen="dashboard" class="active">📋<br>Assignments</button>
    <button data-screen="offline">🔄<br>Sync Queue</button>
  </div>
</div>

<div id="toast-stack"></div>

<script src="/socket.io/socket.io.js"></script>
<script src="js/common.js"></script>
<script src="js/push-client.js"></script>
<script src="js/agent.js"></script>
</body>
</html>
`

---

## File: public/sensor.html
**Purpose:** Virtual Sensor Operator simulation console with bi-temporal satellite controls  
**Path:** public/sensor.html

`html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NER-LIRP · Sensor Operator</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body style="background:var(--paper-dim);">

<div class="phone-shell" style="box-shadow:0 0 40px rgba(0,0,0,0.08);">
  <div class="phone-header" style="border-bottom-color:var(--amber);">
    <div class="phone-header__title">Sensor Operator</div>
    <div class="phone-header__sub" id="operator-sub">Not logged in</div>
  </div>

  <div class="phone-body">

    <!-- LOGIN -->
    <div id="screen-login">
      <div class="card">
        <div class="card__head"><h2>Operator Login</h2></div>
        <p class="muted" style="font-size:11.5px;margin-top:-4px;">Government or Admin credentials required to drive live monitoring nodes.</p>
        <label class="field-label">Email</label>
        <input type="text" id="login-email" value="gov@nerlirp.gov.in" style="margin-bottom:8px;">
        <label class="field-label">Password</label>
        <input type="text" id="login-password" value="demo1234" style="margin-bottom:12px;">
        <button class="btn btn-primary" id="btn-login" style="width:100%;">Login</button>
      </div>
    </div>

    <!-- MAIN CONSOLE -->
    <div id="screen-console" style="display:none;">

      <div class="card">
        <div class="card__head"><h2>Notifications</h2></div>
        <button class="btn btn-outline" id="btn-enable-push" style="width:100%;">🔔 Enable Real Push Alerts on This Phone</button>
        <div class="muted" id="push-status" style="font-size:11px;margin-top:6px;">Not enabled — this device won't receive lock-screen alerts</div>
      </div>

      <div class="card">
        <div class="card__head"><h2>Target Monitoring Node</h2></div>
        <select id="zone-select" style="margin-bottom:10px;"></select>
        <div id="current-risk"></div>
      </div>

      <div class="card">
        <div class="card__head"><h2>Rainfall (24h)</h2><span class="mono" id="val-rainfall">40 mm</span></div>
        <input type="range" id="slider-rainfall" min="0" max="250" value="40" style="height:36px;">
        <div class="muted" style="font-size:11px;display:flex;justify-content:space-between;"><span>Dry</span><span>Storm</span></div>
      </div>

      <div class="card">
        <div class="card__head"><h2>Soil Moisture</h2><span class="mono" id="val-moisture">35 %</span></div>
        <input type="range" id="slider-moisture" min="0" max="100" value="35" style="height:36px;">
      </div>

      <div class="card">
        <div class="card__head"><h2>Ground Movement</h2><span class="mono" id="val-movement">0.5 mm</span></div>
        <input type="range" id="slider-movement" min="0" max="25" step="0.5" value="0.5" style="height:36px;">
      </div>

      <div class="card">
        <div class="card__head">
          <h2>Satellite Earth Observation</h2>
          <span class="badge" style="background:#0284c7;color:#fff;font-size:10px;">Sentinel-2 / InSAR</span>
        </div>
        <p class="muted" style="font-size:11.5px;margin-top:-4px;">Bi-temporal orbital passes compare pre-event baseline vs post-event landslide scar.</p>
        
        <!-- Live Satellite Preview Thumbnail -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
          <div>
            <div class="muted" style="font-size:10px;text-transform:uppercase;margin-bottom:2px;">Before Pass</div>
            <img src="/img/satellite/sector1_before.jpg" alt="Before pass satellite image" style="width:100%;height:85px;object-fit:cover;border-radius:3px;border:1px solid var(--line);">
          </div>
          <div>
            <div class="muted" style="font-size:10px;text-transform:uppercase;margin-bottom:2px;">After Pass (Scar)</div>
            <img src="/img/satellite/sector1_after.jpg" alt="After pass satellite image" id="sensor-sat-after-img" style="width:100%;height:85px;object-fit:cover;border-radius:3px;border:1px solid var(--red);">
          </div>
        </div>

        <label class="field-label">Satellite Pass Scenario</label>
        <select id="sensor-sat-scenario" style="margin-bottom:8px;width:100%;font-size:12px;">
          <option value="CATASTROPHIC_SLIDE">🚨 Catastrophic Slide (18,450 m² scar, -56.8% NDVI, 28.4 cm InSAR)</option>
          <option value="MODERATE_CREEP">⚠️ Active Slope Creep (4,800 m² crack, -21.6% NDVI, 8.6 cm InSAR)</option>
          <option value="BASELINE">✅ Pristine Forest Baseline (No scar, NDVI 0.76, 0.4 cm)</option>
        </select>
        <button class="btn btn-outline" id="btn-satellite" style="width:100%;margin-bottom:8px;">🛰 Run Satellite Bi-temporal Analysis</button>
        <div id="sat-sensor-status" style="font-size:11px;color:var(--slate-500);margin-bottom:12px;">Status: Satellite data synchronized</div>

        <div class="card__head" style="margin-top:6px;"><h2>Seismic Sensor</h2></div>
        <button class="btn btn-outline" id="btn-seismic" style="width:100%;">〰 Trigger Seismic Event (M4.5)</button>
      </div>

      <button class="btn btn-danger" id="btn-reset" style="width:100%;margin-bottom:10px;">Reset This Node to Baseline</button>

      <div class="card">
        <div class="card__head"><h2>Last Pipeline Result</h2></div>
        <div id="last-result" class="muted" style="font-size:12px;">No actions yet</div>
      </div>
    </div>

  </div>
</div>

<div id="toast-stack"></div>

<script src="/socket.io/socket.io.js"></script>
<script src="js/common.js"></script>
<script src="js/push-client.js"></script>
<script src="js/sensor.js"></script>
</body>
</html>
`

---

## File: public/index.html
**Purpose:** Government Command Center Dashboard with interactive Satellite split viewer  
**Path:** public/index.html

`html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="NER-LIRP Government Command Dashboard — AI-based Landslide Monitoring for Northeast India">
<title>NER-LIRP · Government Command Dashboard</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<link rel="stylesheet" href="css/style.css">
</head>
<body>

<div class="topbar">
  <div class="brand">
    <div class="brand__mark"></div>
    <div class="brand__text">
      <div class="brand__title">NER-LIRP</div>
      <div class="brand__subtitle">Landslide Intelligence &amp; Response</div>
    </div>
  </div>
  <nav class="topnav" id="topnav">
    <button data-view="overview" class="active">Dashboard</button>
    <button data-view="map">Risk Map</button>
    <button data-view="satellite">🛰 Satellite Surveillance</button>
    <button data-view="zones">Risk Zones</button>
    <button data-view="reports">Citizen Reports</button>
    <button data-view="operations">Emergency Ops</button>
    <button data-view="alerts">Alerts</button>
    <button data-view="analytics">Analytics</button>
    <button data-view="demo">Demo Control Panel</button>
    <button data-view="admin">Admin</button>
  </nav>
  <div class="topbar__status">
    <button class="btn btn-outline btn-sm" id="btn-export" style="color:#fff;border-color:rgba(255,255,255,0.25);">📄 Export Report</button>
    <button class="btn btn-outline btn-sm" id="btn-enable-push" style="color:#fff;border-color:rgba(255,255,255,0.25);">🔔 Enable Alerts</button>
    <span><span class="live-dot" id="live-dot"></span> <span id="live-label">Live</span></span>
    <span class="muted" id="clock"></span>
  </div>
</div>

<!-- ===================== OVERVIEW ===================== -->
<div class="view active" id="view-overview">
  <div class="section-head">
    <div>
      <h1>Command Overview</h1>
      <p>North East Region · Meghalaya, Assam, Manipur · AI-Powered Early Warning</p>
    </div>
    <span class="badge outline" id="overview-updated">—</span>
  </div>

  <!-- Predictive alert banner -->
  <div id="predictive-banner" style="display:none;background:var(--amber-soft);border:1px solid var(--amber);border-radius:3px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;"></div>

  <div class="summary-row" id="summary-cards"></div>

  <div class="grid-2">
    <div class="card">
      <div class="card__head"><h2>Live Risk Map</h2><span class="muted">Click a marker for details</span></div>
      <div id="map-overview" style="height:380px;border-radius:3px;border:1px solid var(--line);"></div>
    </div>
    <div class="card">
      <div class="card__head"><h2>Live Activity Feed</h2><span class="muted" id="feed-count">0 events</span></div>
      <div class="scroll-panel" id="activity-feed" style="max-height:380px;">
        <div class="empty-state">Waiting for system events…</div>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card__head"><h2>Active Alerts</h2></div>
      <div id="overview-alerts"><div class="empty-state">No active alerts</div></div>
    </div>
    <div class="card">
      <div class="card__head"><h2>Pending Citizen Reports</h2></div>
      <div id="overview-reports"><div class="empty-state">No pending reports</div></div>
    </div>
  </div>
</div>

<!-- ===================== MAP ===================== -->
<div class="view" id="view-map">
  <div class="section-head"><div><h1>Live GIS Risk Map</h1><p>Risk zones, monitoring nodes, citizen reports &amp; field agents</p></div></div>
  <div class="grid-2">
    <div class="card" style="padding:8px;">
      <div id="map" ></div>
    </div>
    <div class="card">
      <div class="card__head"><h2>Risk Zones</h2></div>
      <div class="zone-list" id="map-zone-list"></div>
    </div>
  </div>
</div>

<!-- ===================== SATELLITE SURVEILLANCE ===================== -->
<div class="view" id="view-satellite">
  <div class="section-head">
    <div>
      <h1>🛰 Orbital Earth Observation &amp; Change Detection</h1>
      <p>Copernicus Sentinel-2 (Multispectral Optical) &amp; Sentinel-1 (C-SAR InSAR) Bi-Temporal Surveillance</p>
    </div>
    <div style="display:flex; gap:10px; align-items:center;">
      <select id="sat-zone-selector" style="padding:6px 12px; font-size:12px; border-radius:3px; background:#fff; border:1px solid var(--line);"></select>
      <button class="btn btn-primary btn-sm" id="btn-trigger-sat-pass">🛰 Refresh Satellite Pass</button>
    </div>
  </div>

  <div class="grid-2" style="grid-template-columns: 1.6fr 1fr; gap:16px;">
    <!-- LEFT: Interactive Split Comparison Viewer -->
    <div class="card" style="padding:14px; background:#0b1120; border-color:#1e293b;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="color:#fff; font-weight:600; font-size:13px; display:flex; align-items:center; gap:6px;">
          <span>Sentinel-2 Bi-Temporal Change Detection</span>
          <span class="badge" style="background:#0284c7; color:#fff; font-size:10px;">10m Resolution</span>
        </div>
        <!-- Spectral Band Toggle Buttons -->
        <div style="display:flex; gap:6px;">
          <button class="btn btn-sm btn-outline active-band" id="band-rgb" style="font-size:11px; color:#fff; border-color:#475569; background:#1e293b;">True Color (RGB)</button>
          <button class="btn btn-sm btn-outline" id="band-ndvi" style="font-size:11px; color:#94a3b8; border-color:#475569;">NDVI Infrared</button>
          <button class="btn btn-sm btn-outline" id="band-insar" style="font-size:11px; color:#94a3b8; border-color:#475569;">InSAR Fringes</button>
        </div>
      </div>

      <!-- The Interactive Split Slider Box -->
      <div class="sat-viewer-box" id="sat-viewer-box">
        <!-- Before Layer (Full Width underneath) -->
        <img src="/img/satellite/sector1_before.jpg" alt="Pre-landslide satellite image" class="sat-img-layer" id="sat-img-before">
        <span class="sat-label-tag sat-label-before">📅 Pre-Disaster Pass</span>

        <!-- After Layer (Clipped wrapper) -->
        <div class="sat-img-after-wrapper" id="sat-after-wrap">
          <img src="/img/satellite/sector1_after.jpg" alt="Post-landslide satellite image" id="sat-img-after">
          <span class="sat-label-tag sat-label-after">🚨 Post-Disaster Pass (Scar Detected)</span>
        </div>

        <!-- Draggable Handle Indicator -->
        <div class="sat-handle" id="sat-handle" style="left:50%;">↔</div>

        <!-- The actual range input controlling the split -->
        <input type="range" min="0" max="100" value="50" class="sat-range-input" id="sat-split-slider" aria-label="Satellite comparison slider">
      </div>

      <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:11px; color:#64748b;">
        <span>◀ Drag left to reveal Post-Landslide scar</span>
        <span>Drag right to inspect Pre-Landslide forest ▶</span>
      </div>

      <!-- Telemetry HUD Bar -->
      <div class="sat-hud" style="margin-top:12px; border-radius:4px;">
        <div class="sat-hud-card">
          <div class="sat-hud-lbl">NDVI Loss</div>
          <div class="sat-hud-val alert" id="sat-val-ndvi">-56.8%</div>
          <div class="sat-hud-sub" id="sat-sub-ndvi">0.74 ➔ 0.32 Index</div>
        </div>
        <div class="sat-hud-card">
          <div class="sat-hud-lbl">Debris Scar Area</div>
          <div class="sat-hud-val alert" id="sat-val-scar">18,450 m²</div>
          <div class="sat-hud-sub">Mass Wasting Runout</div>
        </div>
        <div class="sat-hud-card">
          <div class="sat-hud-lbl">InSAR Displacement</div>
          <div class="sat-hud-val alert" id="sat-val-insar">28.4 cm</div>
          <div class="sat-hud-sub">Line-of-Sight Shift</div>
        </div>
        <div class="sat-hud-card">
          <div class="sat-hud-lbl">Confidence Boost</div>
          <div class="sat-hud-val good" id="sat-val-conf">+18%</div>
          <div class="sat-hud-sub">Orbital Corroboration</div>
        </div>
      </div>
    </div>

    <!-- RIGHT: Automated Satellite Analysis & Intelligence Panel -->
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div class="card">
        <div class="card__head">
          <h2>Orbital Verification Analysis</h2>
          <span class="badge red" id="sat-badge-status">VERIFIED LANDSLIDE</span>
        </div>
        <p style="font-size:12.5px; line-height:1.6; color:var(--ink-800);" id="sat-ai-summary">
          Bi-temporal Sentinel-2 spectral differencing detected a catastrophic mass-wasting event. Exposed bedrock and liquid mudflow signature completely severed the NH-40 highway corridor with extensive debris sedimentation in the downstream river basin.
        </p>
        <div class="hr"></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:12px;">
          <div><span class="muted">Satellite Sensor:</span><br><strong id="sat-mission-name">Sentinel-2 (MSI) &amp; Sentinel-1 (C-SAR)</strong></div>
          <div><span class="muted">InSAR Coherence:</span><br><strong id="sat-insar-coherence">0.38 (Severe Loss)</strong></div>
          <div><span class="muted">Baseline Pass:</span><br><strong id="sat-pass-before">14 days ago</strong></div>
          <div><span class="muted">Latest Pass:</span><br><strong id="sat-pass-after">Today (3h ago)</strong></div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><h2>Satellite Pass Scenario Switcher</h2></div>
        <p class="muted" style="font-size:11.5px; margin-top:-4px;">Simulate orbital passes to test the platform's multi-source corroboration and confidence engine.</p>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
          <button class="btn btn-outline" id="btn-sat-catastrophic" style="text-align:left; padding:10px 12px;">
            <strong style="color:var(--red);">🚨 Trigger Catastrophic Landslide Pass</strong><br>
            <span class="muted" style="font-size:11px;">18,450 m² scar, -56.8% NDVI, 28.4 cm InSAR displacement</span>
          </button>
          <button class="btn btn-outline" id="btn-sat-creep" style="text-align:left; padding:10px 12px;">
            <strong style="color:var(--amber);">⚠️ Trigger Active Slope Creep Pass</strong><br>
            <span class="muted" style="font-size:11px;">4,800 m² tension crack, -21.6% NDVI, 8.6 cm InSAR velocity</span>
          </button>
          <button class="btn btn-outline" id="btn-sat-baseline" style="text-align:left; padding:10px 12px;">
            <strong style="color:var(--green);">✅ Reset to Baseline Pristine Forest</strong><br>
            <span class="muted" style="font-size:11px;">Intact forest canopy, NDVI 0.76, 0.4 cm background noise</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ===================== ZONES ===================== -->
<div class="view" id="view-zones">
  <div class="section-head"><div><h1>Risk Zone Details</h1><p>Village ABC — zones A through D</p></div></div>
  <div class="grid-2">
    <div class="card">
      <div class="card__head"><h2>All Risk Zones</h2></div>
      <div class="zone-list" id="zones-list"></div>
    </div>
    <div id="zone-detail-panel"></div>
  </div>
</div>

<!-- ===================== CITIZEN REPORTS ===================== -->
<div class="view" id="view-reports">
  <div class="section-head"><div><h1>Citizen Report Management</h1><p>Review, verify and assign field agents to incoming reports</p></div></div>
  <div class="card">
    <table class="data-table" id="reports-table">
      <thead><tr><th>Type</th><th>Zone</th><th>Description</th><th>Location</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody></tbody>
    </table>
    <div class="empty-state" id="reports-empty" style="display:none;">No citizen reports yet</div>
  </div>
</div>

<!-- ===================== OPERATIONS ===================== -->
<div class="view" id="view-operations">
  <div class="section-head"><div><h1>Emergency Operations</h1><p>Active incidents, assigned agents &amp; field verification</p></div></div>
  <div class="grid-2">
    <div class="card">
      <div class="card__head"><h2>Active Assignments</h2></div>
      <table class="data-table" id="assignments-table">
        <thead><tr><th>Zone</th><th>Agent</th><th>Priority</th><th>Status</th><th>Assigned</th></tr></thead>
        <tbody></tbody>
      </table>
      <div class="empty-state" id="assignments-empty" style="display:none;">No active assignments</div>
    </div>
    <div class="card">
      <div class="card__head"><h2>Field Agents</h2></div>
      <div id="agents-list"></div>
    </div>
  </div>
</div>

<!-- ===================== ALERTS ===================== -->
<div class="view" id="view-alerts">
  <div class="section-head"><div><h1>Alert Management</h1><p>All alerts issued by the decision engine</p></div></div>
  <div class="card">
    <table class="data-table" id="alerts-table">
      <thead><tr><th>Level</th><th>Title</th><th>Zone</th><th>Recommended Action</th><th>Time</th><th>Status</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<!-- ===================== ANALYTICS ===================== -->
<div class="view" id="view-analytics">
  <div class="section-head"><div><h1>Analytics</h1><p>Risk trends and system-wide statistics</p></div></div>
  <div class="grid-3">
    <div class="card"><div class="card__head"><h2>Risk Zone Statistics</h2></div><canvas id="chart-zones" height="180"></canvas></div>
    <div class="card"><div class="card__head"><h2>Risk Score Trend</h2></div><canvas id="chart-trend" height="180"></canvas></div>
    <div class="card"><div class="card__head"><h2>Rainfall Trend (24h)</h2></div><canvas id="chart-rain" height="180"></canvas></div>
  </div>
  <div class="card">
    <div class="card__head"><h2>Select zone for trend charts</h2></div>
    <select id="analytics-zone-select"></select>
  </div>
</div>

<!-- ===================== DEMO CONTROL PANEL ===================== -->
<div class="view" id="view-demo">
  <div class="section-head">
    <div><h1>Simulation / Demo Control Panel</h1><p>Drive the full connected workflow live for demonstration. Every action here is clearly labeled SIMULATED and updates the real risk engine.</p></div>
  </div>
  <div class="card" style="background:var(--amber-soft); border-color:var(--amber);">
    <strong>Demo mode:</strong> values you set here are tagged <span class="src-tag simulated">SIMULATED</span> in the database and are never presented as live sensor data. Use this panel to run the SIH demonstration scenario end-to-end.
  </div>

  <div class="card">
    <div class="card__head"><h2>Select Target Zone</h2></div>
    <select id="demo-zone-select"></select>
    <div class="hr"></div>
    <div id="demo-current-risk"></div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card__head"><h2>Environmental Simulation</h2></div>

      <div class="sim-control">
        <div class="sim-control__head"><span>Rainfall (24h)</span><span class="sim-control__value" id="val-rainfall">40 mm</span></div>
        <input type="range" id="slider-rainfall" min="0" max="250" value="40">
      </div>

      <div class="sim-control">
        <div class="sim-control__head"><span>Soil Moisture</span><span class="sim-control__value" id="val-moisture">35 %</span></div>
        <input type="range" id="slider-moisture" min="0" max="100" value="35">
      </div>

      <div class="sim-control">
        <div class="sim-control__head"><span>Ground Movement</span><span class="sim-control__value" id="val-movement">0.5 mm</span></div>
        <input type="range" id="slider-movement" min="0" max="25" step="0.5" value="0.5">
      </div>

      <div class="sim-control">
        <div class="sim-toggle-row">
          <span>Satellite Surface Change</span>
          <button class="btn btn-outline btn-sm" id="btn-satellite">OFF → Trigger</button>
        </div>
      </div>

      <div class="sim-control">
        <div class="sim-toggle-row">
          <span>Seismic Event (M4.5, 30km)</span>
          <button class="btn btn-outline btn-sm" id="btn-seismic">Trigger</button>
        </div>
      </div>

      <button class="btn btn-outline" id="btn-reset-zone" style="width:100%;margin-top:6px;">Reset Zone to Baseline</button>
    </div>

    <div class="card">
      <div class="card__head"><h2>Evidence &amp; Response Simulation</h2></div>

      <label class="field-label">Add Citizen Report</label>
      <select id="demo-incident-type" style="margin-bottom:8px;">
        <option>Road Crack</option><option>Ground Crack</option><option>Rock Fall</option>
        <option>Mud Movement</option><option>Landslide</option><option>Flooding</option>
        <option>Blocked Road</option><option>Other Hazard</option>
      </select>
      <button class="btn btn-primary" id="btn-add-report" style="width:100%;margin-bottom:14px;">Submit Citizen Report</button>

      <label class="field-label">Assign Field Agent</label>
      <button class="btn btn-primary" id="btn-assign-agent" style="width:100%;margin-bottom:14px;">Assign Nearest Available Agent</button>

      <label class="field-label">Field Verification</label>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-success" id="btn-verify-confirm" style="flex:1;">Confirm Landslide</button>
        <button class="btn btn-outline" id="btn-verify-false" style="flex:1;">False Alarm</button>
      </div>

      <div class="hr"></div>
      <button class="btn btn-outline" id="btn-run-scenario" style="width:100%;">▶ Run Full Demo Scenario (Steps 1–15)</button>
    </div>
  </div>

  <div class="card">
    <div class="card__head"><h2>Pipeline Trace</h2><span class="muted">Every step below triggered: recalculation → impact → decision → alert</span></div>
    <div id="pipeline-trace" class="scroll-panel" style="max-height:260px;"><div class="empty-state">No simulation actions yet</div></div>
  </div>
</div>

<!-- ===================== ADMIN ===================== -->
<div class="view" id="view-admin">
  <div class="section-head"><div><h1>Admin Portal</h1><p>Users, data sources &amp; audit logs</p></div></div>
  <div class="grid-2">
    <div class="card">
      <div class="card__head"><h2>Users</h2></div>
      <table class="data-table" id="users-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody></tbody></table>
    </div>
    <div class="card">
      <div class="card__head"><h2>Data Sources</h2></div>
      <table class="data-table" id="sources-table"><thead><tr><th>Source</th><th>Type</th><th>Reliability</th><th>Status</th></tr></thead><tbody></tbody></table>
    </div>
  </div>
  <div class="card">
    <div class="card__head"><h2>Audit Logs</h2></div>
    <table class="data-table" id="audit-table"><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody></tbody></table>
  </div>
</div>

<div id="toast-stack"></div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
<script src="/socket.io/socket.io.js"></script>
<script src="js/common.js"></script>
<script src="js/push-client.js"></script>
<script src="js/dashboard.js"></script>
</body>
</html>
`

---

## File: public/js/common.js
**Purpose:** Shared client utilities (API calls, toasts, session)  
**Path:** public/js/common.js

`javascript
const API = '/api';

async function apiGet(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}
async function apiPatch(path, body) {
  const res = await fetch(API + path, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}

function levelClass(level) {
  return (level || 'LOW').toLowerCase();
}

function riskColor(level) {
  return { LOW: '#2f7a4f', MEDIUM: '#c98a1c', HIGH: '#cb6a2e', CRITICAL: '#b23a34' }[level] || '#5b7387';
}

function timeAgo(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toast(message, level = 'info') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function srcTag(source, status) {
  const cls = (status || source || '').toLowerCase().replace(/\s+/g, '');
  return `<span class="src-tag ${cls}">${status || source || 'UNKNOWN'}</span>`;
}

// simple sparkline / bar chart on canvas, no external chart lib needed
function drawBarChart(canvasId, labels, values, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth;
  const h = canvas.height = 180;
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(1, ...values);
  const barW = w / values.length;
  values.forEach((v, i) => {
    const barH = (v / max) * (h - 30);
    ctx.fillStyle = colors ? colors[i] : '#22405a';
    ctx.fillRect(i * barW + barW * 0.2, h - barH - 20, barW * 0.6, barH);
    ctx.fillStyle = '#5b7387';
    ctx.font = '10px IBM Plex Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], i * barW + barW / 2, h - 6);
    ctx.fillStyle = '#101e2c';
    ctx.font = '11px IBM Plex Mono, monospace';
    ctx.fillText(v, i * barW + barW / 2, h - barH - 24);
  });
}

function drawLineChart(canvasId, values, color = '#22405a', labelFn) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth;
  const h = canvas.height = 180;
  ctx.clearRect(0, 0, w, h);
  if (!values.length) {
    ctx.fillStyle = '#9db0bd';
    ctx.font = '12px IBM Plex Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', w / 2, h / 2);
    return;
  }
  const max = Math.max(10, ...values);
  const min = Math.min(0, ...values);
  const pad = 20;
  const stepX = (w - pad * 2) / Math.max(1, values.length - 1);
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  values.forEach((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}
`

---

## File: public/js/citizen.js
**Purpose:** Citizen app client logic (GPS, camera, Canvas compression, sync)  
**Path:** public/js/citizen.js

`javascript
registerManifest('manifest-citizen.json', '#173f2b');

let cState = {
  user: null,
  zones: [],
  selectedIncidentType: null,
  gps: null,           // { lat, lng, accuracy }
  photoBase64: null,   // actual base64 image string
  photoMime: 'image/jpeg',
  online: navigator.onLine,
  syncQueue: JSON.parse(localStorage.getItem('nerlirp_citizen_queue') || '[]')
};

const INCIDENT_TYPES = ['Road Crack', 'Ground Crack', 'Rock Fall', 'Mud Movement', 'Landslide', 'Flooding', 'Blocked Road', 'Other Hazard'];

window.addEventListener('online', () => { cState.online = true; toast('Back online'); syncOfflineQueue(); });
window.addEventListener('offline', () => { cState.online = false; toast('You are offline. Reports will be queued.', 'warning'); });

// ── Login ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  try {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { user } = await apiPost('/auth/login', { email, password });
    cState.user = user;
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('screen-home').style.display = 'block';
    document.getElementById('citizen-location').textContent = `${user.name} · Citizen`;
    boot();
  } catch (e) { toast(e.message, 'critical'); }
});

// ── Tab bar ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.phone-tabbar button').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});
function showScreen(name) {
  ['home', 'report', 'myreports', 'safety'].forEach(s => {
    document.getElementById('screen-' + s).style.display = s === name ? 'block' : 'none';
  });
  document.querySelectorAll('.phone-tabbar button').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  if (name === 'myreports') loadMyReports();
}
document.getElementById('btn-quick-report').addEventListener('click', () => showScreen('report'));
document.getElementById('btn-cancel-report').addEventListener('click', () => showScreen('home'));

document.getElementById('btn-enable-push').addEventListener('click', async () => {
  const zoneId = cState.user?.home_risk_zone || cState.zones[0]?.id;
  const result = await enablePushNotifications({ userId: cState.user?.id, deviceLabel: 'Citizen phone', appRole: 'CITIZEN', watchZoneId: zoneId });
  const statusEl = document.getElementById('push-status');
  if (result.ok) { statusEl.textContent = '✅ Enabled — real alerts will appear on this phone'; toast('Push notifications enabled'); }
  else { statusEl.textContent = '❌ ' + result.reason; toast(result.reason, 'critical'); }
});

// ── Home ──────────────────────────────────────────────────────────────────────
async function loadHome() {
  cState.zones = await apiGet('/risk-zones');
  const zoneSelect = document.getElementById('report-zone');
  zoneSelect.innerHTML = cState.zones.map(z => `<option value="${z.id}">${z.code} · ${z.name}</option>`).join('');

  const sorted = [...cState.zones].sort((a, b) => (b.latestRisk?.final_score || 0) - (a.latestRisk?.final_score || 0));
  const top = sorted[0];
  const hero = document.getElementById('risk-hero');
  const level = top?.latestRisk?.risk_level || 'LOW';
  hero.className = 'risk-hero ' + levelClass(level);
  document.getElementById('hero-level').textContent = level;
  document.getElementById('hero-sub').textContent = top ? `${top.name} · score ${Math.round(top.latestRisk?.final_score || 0)}/100 · conf ${top.latestRisk?.confidence || '—'}%` : 'No data';

  document.getElementById('citizen-zones').innerHTML = cState.zones.map(z => `
    <div class="timeline-item">
      <div class="t-dot" style="background:${riskColor(z.latestRisk?.risk_level)}"></div>
      <div style="flex:1;"><strong>${z.code} · ${z.name}</strong><div class="muted">${z.village_name || ''}</div></div>
      <span class="badge ${levelClass(z.latestRisk?.risk_level)}">${z.latestRisk?.risk_level || 'LOW'}</span>
    </div>`).join('');

  const alerts = await apiGet('/alerts?status=ACTIVE');
  const alertsEl = document.getElementById('citizen-alerts');
  alertsEl.innerHTML = alerts.length ? alerts.slice(0, 5).map(a => `
    <div class="timeline-item">
      <div class="t-dot" style="background:${riskColor(a.level === 'EMERGENCY' ? 'CRITICAL' : 'HIGH')}"></div>
      <div style="flex:1;"><strong>${a.title}</strong><div class="muted">${a.recommended_action}</div></div>
    </div>`).join('') : '<div class="empty-state">No active alerts</div>';
}

// ── Incident type grid ────────────────────────────────────────────────────────
const grid = document.getElementById('incident-grid');
grid.innerHTML = INCIDENT_TYPES.map(t => `<div class="incident-btn" data-type="${t}">${t}</div>`).join('');
grid.querySelectorAll('.incident-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    grid.querySelectorAll('.incident-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    cState.selectedIncidentType = btn.dataset.type;
  });
});

// ── Real GPS capture ──────────────────────────────────────────────────────────
document.getElementById('btn-capture-gps').addEventListener('click', () => {
  if (!navigator.geolocation) {
    toast('Geolocation not supported on this device', 'warning');
    return;
  }
  const btn = document.getElementById('btn-capture-gps');
  btn.textContent = '⏳ Getting location…';
  btn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      cState.gps = { lat, lng, accuracy };
      document.getElementById('gps-status').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)} (±${Math.round(accuracy)}m)`;
      document.getElementById('gps-badge-container').innerHTML =
        `<div class="gps-badge">✅ GPS Captured · ±${Math.round(accuracy)}m accuracy</div>`;
      btn.textContent = '✅ Location Captured';
      btn.disabled = false;
      toast('GPS location captured');
    },
    (err) => {
      btn.textContent = '📍 Capture My Location';
      btn.disabled = false;
      toast('GPS failed: ' + err.message, 'warning');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
});

// ── Real camera / photo capture ───────────────────────────────────────────────
function compressAndStoreImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_SIZE = 800;
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) { height = Math.round((height * MAX_SIZE) / width); width = MAX_SIZE; }
          else { width = Math.round((width * MAX_SIZE) / height); height = MAX_SIZE; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', 0.82);
        cState.photoBase64 = base64;
        cState.photoMime = 'image/jpeg';
        // Show preview
        const preview = document.getElementById('photo-preview');
        preview.src = base64;
        preview.style.display = 'block';
        // Show pending AI badge
        document.getElementById('ai-analysis-result').style.display = 'block';
        document.getElementById('ai-analysis-result').innerHTML =
          `<div class="ai-result pending">🤖 AI will analyze this image on submit…</div>`;
        resolve(base64);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

document.getElementById('btn-take-photo').addEventListener('click', () => {
  document.getElementById('photo-camera').click();
});
document.getElementById('btn-pick-photo').addEventListener('click', () => {
  document.getElementById('photo-gallery').click();
});

function handlePhotoFile(input) {
  input.addEventListener('change', async () => {
    if (!input.files?.length) return;
    const file = input.files[0];
    await compressAndStoreImage(file);
    input.value = ''; // reset so same file can be selected again
  });
}
handlePhotoFile(document.getElementById('photo-camera'));
handlePhotoFile(document.getElementById('photo-gallery'));

// ── Submit report ─────────────────────────────────────────────────────────────
document.getElementById('offline-banner').style.display = cState.online ? 'none' : 'block';

document.getElementById('btn-submit-report').addEventListener('click', async () => {
  if (!cState.selectedIncidentType) return toast('Please select an incident type', 'warning');
  const zoneId = document.getElementById('report-zone').value;

  const payload = {
    risk_zone_id: zoneId,
    user_id: cState.user?.id,
    incident_type: cState.selectedIncidentType,
    description: document.getElementById('report-description').value,
    latitude: cState.gps?.lat || null,
    longitude: cState.gps?.lng || null,
    gps_accuracy: cState.gps?.accuracy || null,
    photo_base64: cState.photoBase64 || null,
    photo_mime: cState.photoMime,
    photo_note: cState.photoBase64 ? 'Photo uploaded by citizen' : null
  };

  if (!cState.online) {
    // Store offline — but strip photo for localStorage size (store flag only)
    const queueItem = { ...payload, photo_base64: cState.photoBase64, queuedAt: new Date().toISOString(), localId: 'local-' + Date.now() };
    cState.syncQueue.push(queueItem);
    try { localStorage.setItem('nerlirp_citizen_queue', JSON.stringify(cState.syncQueue)); } catch (e) {
      // If storage full, strip photo and retry
      queueItem.photo_base64 = null;
      localStorage.setItem('nerlirp_citizen_queue', JSON.stringify(cState.syncQueue));
    }
    toast('Offline: report queued for sync', 'warning');
    resetReportForm();
    showScreen('myreports');
    return;
  }

  const btn = document.getElementById('btn-submit-report');
  btn.disabled = true;
  btn.textContent = cState.photoBase64 ? '🤖 Analyzing image…' : '⏳ Submitting…';

  try {
    const result = await apiPost('/citizen-reports', payload);
    // Show AI result to user
    const aiRes = result.imageAnalysis;
    if (aiRes && !aiRes.skipped) {
      const el = document.getElementById('ai-analysis-result');
      el.style.display = 'block';
      if (aiRes.match) {
        el.innerHTML = `<div class="ai-result match">✅ AI confirmed: Image matches ${cState.selectedIncidentType} (${aiRes.confidence}% confidence)<br><span style="font-size:11px;">${aiRes.ai_description}</span></div>`;
      } else {
        el.innerHTML = `<div class="ai-result no-match">⚠ AI analysis: Image may not clearly show ${cState.selectedIncidentType}<br><span style="font-size:11px;">${aiRes.ai_description || 'Detected: ' + aiRes.detected_type}</span></div>`;
      }
      await new Promise(r => setTimeout(r, 2000)); // show result before navigating
    }
    toast('Report submitted successfully');
    resetReportForm();
    showScreen('myreports');
    loadHome();
  } catch (e) {
    toast(e.message, 'critical');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Report';
  }
});

function resetReportForm() {
  cState.selectedIncidentType = null;
  cState.gps = null;
  cState.photoBase64 = null;
  grid.querySelectorAll('.incident-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('report-description').value = '';
  document.getElementById('gps-status').textContent = 'Not captured';
  document.getElementById('gps-badge-container').innerHTML = '';
  document.getElementById('photo-preview').style.display = 'none';
  document.getElementById('photo-preview').src = '';
  document.getElementById('ai-analysis-result').style.display = 'none';
  document.getElementById('btn-capture-gps').textContent = '📍 Capture My Location';
}

// ── My Reports ────────────────────────────────────────────────────────────────
async function loadMyReports() {
  const el = document.getElementById('my-reports-list');
  let serverReports = [];
  try { serverReports = cState.user ? await apiGet(`/citizen-reports?user_id=${cState.user.id}`) : []; } catch (e) {}

  const queueHtml = cState.syncQueue.map(q => `
    <div class="report-card" style="display:flex;gap:8px;align-items:flex-start;">
      ${q.photo_base64 ? `<img class="img-thumb" src="${q.photo_base64}" alt="photo">` : '<div style="width:48px;height:48px;background:var(--paper-dim);border-radius:3px;flex-shrink:0;"></div>'}
      <div style="flex:1;">
        <strong>${q.incident_type}</strong>
        <div class="muted">${q.description || 'No description'}</div>
        ${q.latitude ? `<div class="muted" style="font-size:10px;">📍 GPS captured</div>` : ''}
      </div>
      <span class="sync-pill PENDING">PENDING SYNC</span>
    </div>`).join('');

  const serverHtml = serverReports.map(r => `
    <div class="report-card" style="display:flex;gap:8px;align-items:flex-start;">
      ${r.photo_note && r.photo_note.includes('✅') ? `<img class="img-thumb" src="/api/citizen-reports/${r.id}/photo" onerror="this.style.display='none'" alt="photo">` : '<div style="width:48px;height:48px;background:var(--paper-dim);border-radius:3px;flex-shrink:0;text-align:center;line-height:48px;font-size:20px;">📋</div>'}
      <div style="flex:1;">
        <strong>${r.incident_type}</strong>
        <div class="muted">${r.description || 'No description'} · ${timeAgo(r.created_at)}</div>
        ${r.photo_note ? `<div style="font-size:11px;margin-top:2px;">${r.photo_note}</div>` : ''}
        ${r.latitude ? `<div class="muted" style="font-size:10px;">📍 ${r.latitude?.toFixed(4)}, ${r.longitude?.toFixed(4)}</div>` : ''}
      </div>
      <span class="status-pill ${r.status.replace(' ', '_')}">${r.status}</span>
    </div>`).join('');

  el.innerHTML = queueHtml + serverHtml || '<div class="empty-state">No reports submitted yet</div>';
}

async function syncOfflineQueue() {
  if (!cState.syncQueue.length) return;
  toast(`Syncing ${cState.syncQueue.length} offline report(s)…`);
  const remaining = [];
  for (const item of cState.syncQueue) {
    try {
      const { localId, queuedAt, ...payload } = item;
      await apiPost('/citizen-reports', payload);
    } catch (e) { remaining.push(item); }
  }
  cState.syncQueue = remaining;
  localStorage.setItem('nerlirp_citizen_queue', JSON.stringify(cState.syncQueue));
  toast('Offline reports synced');
  loadMyReports();
  loadHome();
}

// live updates
const socket = io();
socket.on('risk:update', () => { if (document.getElementById('screen-home').style.display !== 'none') loadHome(); });
socket.on('alert:new', (a) => toast(`🚨 ${a.title}`, a.level === 'EMERGENCY' ? 'critical' : 'warning'));
socket.on('predictive:alert', (p) => toast(`⚠ Predictive: ${p.message}`, 'warning'));

async function boot() {
  await loadHome();
  if (cState.syncQueue.length && cState.online) syncOfflineQueue();
}
`

---

## File: public/js/agent.js
**Purpose:** Agent app client logic (navigation, verification, photo upload)  
**Path:** public/js/agent.js

`javascript
registerManifest('manifest-agent.json', '#6b3212');

let aState = {
  user: null,
  assignments: [],
  activeAssignment: null,
  selectedResult: null,
  photoBase64: null,
  photoMime: 'image/jpeg',
  agentGps: null,
  online: navigator.onLine,
  syncQueue: JSON.parse(localStorage.getItem('nerlirp_agent_queue') || '[]')
};

window.addEventListener('online', () => { aState.online = true; syncOfflineQueue(); });
window.addEventListener('offline', () => { aState.online = false; toast('You are offline. Verifications will be queued.', 'warning'); });

// ── Login ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  try {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { user } = await apiPost('/auth/login', { email, password });
    aState.user = user;
    document.getElementById('agent-name-sub').textContent = `${user.name} · Field Agent`;
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('screen-dashboard').style.display = 'block';
    boot();
  } catch (e) { toast(e.message, 'critical'); }
});

// ── Tab bar ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.phone-tabbar button').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});
function showScreen(name) {
  ['dashboard', 'detail', 'verify', 'offline'].forEach(s => {
    document.getElementById('screen-' + s).style.display = s === name ? 'block' : 'none';
  });
  document.querySelectorAll('.phone-tabbar button[data-screen]').forEach(b => {
    if (b.dataset.screen === 'dashboard' || b.dataset.screen === 'offline')
      b.classList.toggle('active', b.dataset.screen === name);
  });
  if (name === 'offline') renderOfflineQueue();
}

document.getElementById('btn-enable-push').addEventListener('click', async () => {
  const activeZone = aState.assignments.find(a => a.status !== 'COMPLETED')?.risk_zone_id || null;
  const result = await enablePushNotifications({ userId: aState.user?.id, deviceLabel: 'Field Agent phone', appRole: 'FIELD_AGENT', watchZoneId: activeZone });
  const statusEl = document.getElementById('push-status');
  if (result.ok) { statusEl.textContent = '✅ Enabled — alerts for your zone on this phone'; toast('Push notifications enabled'); }
  else { statusEl.textContent = '❌ ' + result.reason; toast(result.reason, 'critical'); }
});

document.querySelectorAll('.status-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('agent-current-status').textContent = btn.dataset.status;
    toast(`Status set to ${btn.dataset.status}`);
  });
});

// ── Assignments ───────────────────────────────────────────────────────────────
async function loadAssignments() {
  aState.assignments = await apiGet(`/agent-assignments?agent_id=${aState.user.id}`);
  const el = document.getElementById('assignments-list');
  const active = aState.assignments.filter(a => a.status !== 'COMPLETED');
  document.getElementById('agent-current-status').textContent = active.length ? 'ASSIGNED' : 'AVAILABLE';

  el.innerHTML = active.length ? active.map(a => `
    <div class="timeline-item" style="cursor:pointer;" data-open="${a.id}">
      <div class="t-dot" style="background:${a.priority === 'CRITICAL' ? '#b23a34' : '#c98a1c'}"></div>
      <div style="flex:1;">
        <strong>${a.zone_code} · ${a.zone_name}</strong>
        <div class="muted">Priority: ${a.priority} · ${timeAgo(a.created_at)}</div>
        ${a.citizen_report ? `<div style="font-size:11px;color:var(--orange);">Citizen report: ${a.citizen_report.incident_type}</div>` : ''}
      </div>
      <span class="badge outline">${a.status.replace('_', ' ')}</span>
    </div>`).join('') : '<div class="empty-state">No active assignments</div>';

  el.querySelectorAll('[data-open]').forEach(row => {
    row.addEventListener('click', () => openAssignment(row.dataset.open));
  });
}

function openAssignment(id) {
  const a = aState.assignments.find(x => x.id === id);
  aState.activeAssignment = a;
  const card = document.getElementById('detail-card');

  // Show citizen's photo if available
  const citizenPhotoHtml = a.citizen_report?.photo_note?.includes('✅')
    ? `<div style="margin-bottom:10px;">
         <div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--amber);">Citizen Evidence Photo:</div>
         <img src="/api/citizen-reports/${a.citizen_report?.id}/photo" style="width:100%;max-height:150px;object-fit:cover;border-radius:4px;border:2px solid var(--amber);" onerror="this.parentElement.style.display='none'" alt="citizen photo">
         <div style="font-size:11px;margin-top:3px;">${a.citizen_report?.photo_note || ''}</div>
       </div>`
    : '';

  card.innerHTML = `
    <div class="card__head">
      <h2>${a.zone_code} · ${a.zone_name}</h2>
      <span class="badge ${a.priority === 'CRITICAL' ? 'critical' : 'high'}">${a.priority}</span>
    </div>
    <div class="mono muted" style="font-size:11.5px;margin-bottom:10px;">${a.latitude?.toFixed(5)}, ${a.longitude?.toFixed(5)}</div>
    ${citizenPhotoHtml}
    ${a.citizen_report ? `<div style="background:var(--amber-soft);border:1px solid var(--amber);border-radius:3px;padding:8px;margin-bottom:10px;font-size:12px;">
      <strong>Citizen Report:</strong> ${a.citizen_report.incident_type}<br>
      <span class="muted">${a.citizen_report.description || 'No description'}</span>
      ${a.citizen_report.latitude ? `<div style="font-size:11px;margin-top:3px;">📍 GPS: ${a.citizen_report.latitude?.toFixed(4)}, ${a.citizen_report.longitude?.toFixed(4)}</div>` : ''}
    </div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      <button class="btn btn-outline btn-sm" data-next="ACCEPTED">✅ Accept</button>
      <button class="btn btn-outline btn-sm" data-next="EN_ROUTE">🚗 En Route</button>
      <button class="btn btn-outline btn-sm" data-next="ON_SITE">📍 On Site</button>
      <a class="btn btn-outline btn-sm" href="https://www.google.com/maps/dir/?api=1&destination=${a.latitude},${a.longitude}" target="_blank">🧭 Navigate</a>
    </div>
    <div class="muted" style="font-size:11.5px;margin-bottom:12px;">Status: <strong id="detail-status">${a.status}</strong></div>
    <button class="btn btn-primary" id="btn-go-verify" style="width:100%;padding:12px;">📋 Start Field Verification</button>
    <button class="btn btn-outline" id="btn-back-dash" style="width:100%;margin-top:6px;">← Back</button>
  `;

  card.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await apiPatch(`/agent-assignments/${a.id}`, { status: btn.dataset.next });
      document.getElementById('detail-status').textContent = btn.dataset.next.replace('_', ' ');
      toast('Status: ' + btn.dataset.next.replace('_', ' '));
    });
  });
  card.querySelector('#btn-go-verify').addEventListener('click', () => {
    document.getElementById('verify-zone-name').textContent = `${a.zone_code} · ${a.zone_name}`;
    // Show citizen photo in verification screen
    const evidenceDiv = document.getElementById('citizen-evidence');
    const citizenImg = document.getElementById('citizen-photo-img');
    const citizenNote = document.getElementById('citizen-ai-note');
    if (a.citizen_report?.photo_note?.includes('✅')) {
      citizenImg.src = `/api/citizen-reports/${a.citizen_report?.id}/photo`;
      citizenNote.textContent = a.citizen_report?.photo_note || '';
      evidenceDiv.style.display = 'block';
    } else {
      evidenceDiv.style.display = 'none';
    }
    // Show current risk confidence for chain display
    apiGet(`/risk-zones/${a.risk_zone_id}/risk`).then(risk => {
      if (risk) {
        document.getElementById('cc-before').textContent = (risk.confidence || '?') + '%';
        document.getElementById('cc-after').textContent = Math.min(99, (risk.confidence || 60) + 20) + '%';
        document.getElementById('conf-chain').style.display = 'block';
      }
    }).catch(() => {});
    showScreen('verify');
  });
  card.querySelector('#btn-back-dash').addEventListener('click', () => showScreen('dashboard'));
  showScreen('detail');
}

// ── Verification result selector ──────────────────────────────────────────────
document.querySelectorAll('#screen-verify .incident-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#screen-verify .incident-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    aState.selectedResult = btn.dataset.result;
  });
});

// ── Real GPS at site ──────────────────────────────────────────────────────────
document.getElementById('btn-agent-gps').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('Geolocation not supported', 'warning'); return; }
  const btn = document.getElementById('btn-agent-gps');
  btn.textContent = '⏳ Getting location…'; btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      aState.agentGps = { lat, lng, accuracy };
      document.getElementById('agent-gps-status').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)} (±${Math.round(accuracy)}m)`;
      document.getElementById('agent-gps-badge').innerHTML =
        `<div class="gps-badge">✅ Site GPS · ±${Math.round(accuracy)}m accuracy</div>`;
      btn.textContent = '✅ Location Captured'; btn.disabled = false;
      toast('Site GPS captured');
    },
    (err) => { btn.textContent = '📍 Capture Site Location'; btn.disabled = false; toast('GPS failed: ' + err.message, 'warning'); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
});

// ── Real camera capture ───────────────────────────────────────────────────────
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900;
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const b64 = canvas.toDataURL('image/jpeg', 0.85);
        aState.photoBase64 = b64;
        aState.photoMime = 'image/jpeg';
        const preview = document.getElementById('verify-photo-preview');
        preview.src = b64; preview.style.display = 'block';
        document.getElementById('verify-ai-result').style.display = 'block';
        document.getElementById('verify-ai-result').innerHTML =
          `<div class="ai-result pending">🤖 AI will analyze your field photo on submit…</div>`;
        resolve(b64);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

document.getElementById('btn-verify-camera').addEventListener('click', () => document.getElementById('verify-camera').click());
document.getElementById('btn-verify-gallery').addEventListener('click', () => document.getElementById('verify-gallery').click());

['verify-camera', 'verify-gallery'].forEach(id => {
  document.getElementById(id).addEventListener('change', async (e) => {
    if (!e.target.files?.length) return;
    await compressImage(e.target.files[0]);
    e.target.value = '';
  });
});

document.getElementById('btn-cancel-verify').addEventListener('click', () => { resetVerifyForm(); showScreen('detail'); });
document.getElementById('agent-offline-banner').style.display = aState.online ? 'none' : 'block';

// ── Submit verification ───────────────────────────────────────────────────────
document.getElementById('btn-submit-verification').addEventListener('click', async () => {
  if (!aState.selectedResult) return toast('Select a verification result', 'warning');
  const a = aState.activeAssignment;
  const payload = {
    assignment_id: a.id,
    risk_zone_id: a.risk_zone_id,
    agent_id: aState.user.id,
    notes: document.getElementById('verify-notes').value,
    verification_result: aState.selectedResult,
    photo_base64: aState.photoBase64 || null,
    photo_mime: aState.photoMime,
    agent_gps: aState.agentGps || null,
    photo_note: aState.photoBase64 ? 'Field evidence photo uploaded' : null
  };

  if (!aState.online) {
    aState.syncQueue.push({ ...payload, queuedAt: new Date().toISOString() });
    try { localStorage.setItem('nerlirp_agent_queue', JSON.stringify(aState.syncQueue)); } catch (e) {
      payload.photo_base64 = null;
      localStorage.setItem('nerlirp_agent_queue', JSON.stringify(aState.syncQueue));
    }
    toast('Offline: verification queued for sync', 'warning');
    resetVerifyForm(); showScreen('offline');
    return;
  }

  const btn = document.getElementById('btn-submit-verification');
  btn.disabled = true;
  btn.textContent = aState.photoBase64 ? '🤖 Analyzing field photo…' : '⏳ Submitting…';

  try {
    const result = await apiPost('/field-reports', payload);
    // Show AI result
    const aiRes = result.imageAnalysis;
    if (aiRes && !aiRes.skipped) {
      const el = document.getElementById('verify-ai-result');
      el.style.display = 'block';
      if (aiRes.match) {
        el.innerHTML = `<div class="ai-result match">✅ AI confirms hazard in your photo (${aiRes.confidence}% confidence): ${aiRes.ai_description}</div>`;
      } else {
        el.innerHTML = `<div class="ai-result no-match">ℹ AI analyzed your photo (${aiRes.confidence}% confidence): ${aiRes.ai_description || 'See details in dashboard'}</div>`;
      }
      await new Promise(r => setTimeout(r, 2500));
    }
    toast('Field verification submitted — risk recalculated');
    resetVerifyForm(); showScreen('dashboard');
    loadAssignments();
  } catch (e) {
    toast(e.message, 'critical');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Verification';
  }
});

function resetVerifyForm() {
  aState.selectedResult = null; aState.photoBase64 = null; aState.agentGps = null;
  document.querySelectorAll('#screen-verify .incident-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('verify-notes').value = '';
  document.getElementById('verify-photo-preview').style.display = 'none';
  document.getElementById('verify-photo-preview').src = '';
  document.getElementById('verify-ai-result').style.display = 'none';
  document.getElementById('agent-gps-status').textContent = 'Not captured';
  document.getElementById('agent-gps-badge').innerHTML = '';
  document.getElementById('btn-agent-gps').textContent = '📍 Capture Site Location';
  document.getElementById('conf-chain').style.display = 'none';
  document.getElementById('citizen-evidence').style.display = 'none';
}

function renderOfflineQueue() {
  const el = document.getElementById('agent-offline-list');
  el.innerHTML = aState.syncQueue.length ? aState.syncQueue.map(q => `
    <div class="timeline-item">
      <div class="t-dot" style="background:#c98a1c;"></div>
      <div style="flex:1;"><strong>${q.verification_result}</strong><div class="muted">${q.notes || 'No notes'}</div>
      ${q.photo_base64 ? '<div style="font-size:11px;">📷 Photo queued</div>' : ''}
      ${q.agent_gps ? `<div style="font-size:11px;">📍 GPS: ${q.agent_gps.lat?.toFixed(4)}, ${q.agent_gps.lng?.toFixed(4)}</div>` : ''}
      </div>
      <span class="sync-pill PENDING">PENDING SYNC</span>
    </div>`).join('') : '<div class="empty-state">No pending items</div>';
}

async function syncOfflineQueue() {
  if (!aState.syncQueue.length) return;
  toast(`Syncing ${aState.syncQueue.length} offline verification(s)…`);
  const remaining = [];
  for (const item of aState.syncQueue) {
    try { const { queuedAt, ...payload } = item; await apiPost('/field-reports', payload); }
    catch (e) { remaining.push(item); }
  }
  aState.syncQueue = remaining;
  localStorage.setItem('nerlirp_agent_queue', JSON.stringify(aState.syncQueue));
  toast('Offline verifications synced');
  renderOfflineQueue(); loadAssignments();
}

const socket = io();
socket.on('risk:update', () => { if (document.getElementById('screen-dashboard').style.display !== 'none') loadAssignments(); });
socket.on('auto:escalation', (data) => toast(`⚡ Auto-assigned to ${data.zoneName}: ${data.riskLevel}`, 'critical'));

async function boot() {
  await loadAssignments();
  if (aState.syncQueue.length && aState.online) syncOfflineQueue();
}
`

---

## File: public/js/sensor.js
**Purpose:** Sensor operator console sliders and bi-temporal satellite trigger  
**Path:** public/js/sensor.js

`javascript
registerManifest('manifest-sensor.json', '#5c4013');

let sState = { user: null, zones: [], zoneId: null };

document.getElementById('btn-login').addEventListener('click', async () => {
  try {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { user } = await apiPost('/auth/login', { email, password });
    if (!['GOVERNMENT', 'ADMIN'].includes(user.role)) {
      return toast('This console requires a Government or Admin login', 'critical');
    }
    sState.user = user;
    document.getElementById('operator-sub').textContent = `${user.name} · ${user.role}`;
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('screen-console').style.display = 'block';
    boot();
  } catch (e) { toast(e.message, 'critical'); }
});

document.getElementById('btn-enable-push').addEventListener('click', async () => {
  const result = await enablePushNotifications({
    userId: sState.user?.id, deviceLabel: 'Sensor Operator phone', appRole: 'GOVERNMENT', watchZoneId: sState.zoneId
  });
  const statusEl = document.getElementById('push-status');
  if (result.ok) {
    statusEl.textContent = '✅ Enabled — this device will receive real alerts for the selected zone (and all critical alerts)';
    toast('Push notifications enabled on this device');
  } else {
    statusEl.textContent = '❌ ' + result.reason;
    toast(result.reason, 'critical');
  }
});

async function loadZones() {
  sState.zones = await apiGet('/risk-zones');
  const sel = document.getElementById('zone-select');
  sel.innerHTML = sState.zones.map(z => `<option value="${z.id}">${z.code} · ${z.name}</option>`).join('');
  sel.addEventListener('change', () => { sState.zoneId = sel.value; loadZoneIntoSliders(sel.value); });
  sState.zoneId = sState.zones.find(z => z.code === 'D')?.id || sState.zones[0]?.id;
  sel.value = sState.zoneId;
}

async function loadZoneIntoSliders(zoneId) {
  const profile = await apiGet(`/risk-zones/${zoneId}/profile`);
  document.getElementById('slider-rainfall').value = profile.weather?.rainfall_24h ?? 40;
  document.getElementById('val-rainfall').textContent = `${profile.weather?.rainfall_24h ?? 40} mm`;
  document.getElementById('slider-moisture').value = profile.sensor?.soil_moisture ?? 35;
  document.getElementById('val-moisture').textContent = `${profile.sensor?.soil_moisture ?? 35} %`;
  document.getElementById('slider-movement').value = profile.sensor?.ground_movement_mm ?? 0.5;
  document.getElementById('val-movement').textContent = `${profile.sensor?.ground_movement_mm ?? 0.5} mm`;

  const risk = await apiGet(`/risk-zones/${zoneId}/risk`).catch(() => null);
  renderCurrentRisk(risk ? { riskLevel: risk.risk_level, finalScore: risk.final_score, confidence: risk.confidence } : null);
}

function renderCurrentRisk(r) {
  const el = document.getElementById('current-risk');
  if (!r) { el.innerHTML = '<div class="empty-state">No prediction yet</div>'; return; }
  el.innerHTML = `<div style="display:flex;gap:12px;align-items:center;">
    <span class="badge ${levelClass(r.riskLevel)}" style="font-size:13px;padding:6px 14px;">${r.riskLevel}</span>
    <div>Score <strong>${Math.round(r.finalScore)}</strong></div>
    <div>Conf <strong>${r.confidence}%</strong></div>
  </div>`;
}

function showResult(result) {
  const el = document.getElementById('last-result');
  el.innerHTML = `<strong>${result.reason}</strong><br>
    Risk → <span class="badge ${levelClass(result.prediction.riskLevel)}">${result.prediction.riskLevel}</span>
    score ${Math.round(result.prediction.finalScore)} · confidence ${result.prediction.confidence}%
    ${result.alert ? `<br>Alert issued: <strong>${result.alert.level}</strong>` : ''}
    ${result.pushResult ? `<br>📲 Push sent to ${result.pushResult.sent} device(s)` : ''}`;
  renderCurrentRisk(result.prediction);
  if (result.alert) toast(`Alert issued: ${result.alert.level}`, result.alert.level === 'EMERGENCY' ? 'critical' : 'warning');
}

function bindSlider(sliderId, valId, unit, fn) {
  const slider = document.getElementById(sliderId);
  let debounce;
  slider.addEventListener('input', () => {
    document.getElementById(valId).textContent = `${slider.value} ${unit}`;
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      try { showResult(await fn(Number(slider.value))); } catch (e) { toast(e.message, 'critical'); }
    }, 350);
  });
}

function initControls() {
  bindSlider('slider-rainfall', 'val-rainfall', 'mm', v => apiPost('/simulation/rainfall', { risk_zone_id: sState.zoneId, rainfall_24h: v }));
  bindSlider('slider-moisture', 'val-moisture', '%', v => apiPost('/simulation/soil-moisture', { risk_zone_id: sState.zoneId, soil_moisture: v }));
  bindSlider('slider-movement', 'val-movement', 'mm', v => apiPost('/simulation/ground-movement', { risk_zone_id: sState.zoneId, ground_movement_mm: v }));

  const scenarioSelect = document.getElementById('sensor-sat-scenario');
  const afterImg = document.getElementById('sensor-sat-after-img');
  if (scenarioSelect && afterImg) {
    scenarioSelect.addEventListener('change', () => {
      if (scenarioSelect.value === 'BASELINE') {
        afterImg.src = '/img/satellite/sector1_before.jpg';
        afterImg.style.borderColor = 'var(--green)';
      } else {
        afterImg.src = '/img/satellite/sector1_after.jpg';
        afterImg.style.borderColor = 'var(--red)';
      }
    });
  }

  document.getElementById('btn-satellite').addEventListener('click', async () => {
    const scenario = scenarioSelect?.value || 'CATASTROPHIC_SLIDE';
    const statusEl = document.getElementById('sat-sensor-status');
    if (statusEl) statusEl.textContent = '⏳ Processing bi-temporal pass & InSAR fringes...';
    try {
      const res = await apiPost('/satellite/analyze', { risk_zone_id: sState.zoneId, scenario_type: scenario });
      if (afterImg && res.satellite?.after_image_url) afterImg.src = res.satellite.after_image_url;
      if (statusEl) {
        statusEl.innerHTML = `<strong style="color:${res.satellite.change_detected ? 'var(--red)' : 'var(--green)'}">
          ${res.satellite.change_detected ? `🚨 Scar: ${(res.satellite.scar_area_sqm || 0).toLocaleString()} m² (-${res.satellite.vegetation_loss_pct}% NDVI)` : '✅ Stable baseline'}
        </strong>`;
      }
      showResult(res.pipeline);
      toast('Satellite pass verified: Confidence & risk score updated!', 'info');
    } catch (e) {
      toast(e.message, 'critical');
    }
  });

  document.getElementById('btn-seismic').addEventListener('click', async () => {
    try { showResult(await apiPost('/simulation/seismic', { risk_zone_id: sState.zoneId, magnitude: 4.5, distance_km: 30 })); }
    catch (e) { toast(e.message, 'critical'); }
  });

  document.getElementById('btn-reset').addEventListener('click', async () => {
    try { showResult(await apiPost('/simulation/reset', { risk_zone_id: sState.zoneId })); loadZoneIntoSliders(sState.zoneId); }
    catch (e) { toast(e.message, 'critical'); }
  });
}

const socket = io();
socket.on('risk:update', (payload) => {
  if (payload.zoneId === sState.zoneId && document.getElementById('screen-console').style.display !== 'none') {
    renderCurrentRisk(payload.prediction);
  }
});

async function boot() {
  await loadZones();
  await loadZoneIntoSliders(sState.zoneId);
  initControls();
}
`

---

## File: public/js/push-client.js
**Purpose:** Service worker registration and push subscription client  
**Path:** public/js/push-client.js

`javascript
// Shared Web Push client helper used by citizen.js, agent.js, and sensor.js.
// This is real browser Push API + Service Worker code — when it succeeds,
// the phone is genuinely registered with the browser's push service
// (FCM on Android/Chrome, APNs-backed webpush on iOS 16.4+ Safari PWAs).

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported in this browser');
    return null;
  }
  return navigator.serviceWorker.register('/sw.js');
}

// pushConfig: { userId, deviceLabel, appRole: 'CITIZEN'|'FIELD_AGENT'|'GOVERNMENT'|'ADMIN', watchZoneId }
async function enablePushNotifications(pushConfig) {
  if (!('Notification' in window) || !('PushManager' in window)) {
    return { ok: false, reason: 'Push notifications are not supported on this browser/device.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'Notification permission was not granted.' };
  }

  const reg = await registerServiceWorker();
  if (!reg) return { ok: false, reason: 'Could not register service worker.' };
  await navigator.serviceWorker.ready;

  const { publicKey } = await apiGet('/push/vapid-public-key');

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  await apiPost('/push/subscribe', {
    subscription: subscription.toJSON(),
    userId: pushConfig.userId || null,
    deviceLabel: pushConfig.deviceLabel || navigator.userAgent.slice(0, 60),
    appRole: pushConfig.appRole,
    watchZoneId: pushConfig.watchZoneId || null
  });

  return { ok: true };
}

async function disablePushNotifications() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    await apiPost('/push/unsubscribe', { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
}

function registerManifest(manifestPath, themeColor) {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = manifestPath;
  document.head.appendChild(link);

  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = themeColor;
  document.head.appendChild(meta);

  // iOS Safari "Add to Home Screen" support
  const appleCapable = document.createElement('meta');
  appleCapable.name = 'apple-mobile-web-app-capable';
  appleCapable.content = 'yes';
  document.head.appendChild(appleCapable);

  const appleStatus = document.createElement('meta');
  appleStatus.name = 'apple-mobile-web-app-status-bar-style';
  appleStatus.content = 'black-translucent';
  document.head.appendChild(appleStatus);
}
`

---

## File: public/js/dashboard.js
**Purpose:** Command dashboard logic with Satellite split comparison slider and HUD  
**Path:** public/js/dashboard.js

`javascript
registerManifest('manifest-admin.json', '#0c1620');

document.getElementById('btn-enable-push').addEventListener('click', async () => {
  const result = await enablePushNotifications({ appRole: 'GOVERNMENT', deviceLabel: 'Command laptop' });
  toast(result.ok ? 'Push notifications enabled — this device gets every alert' : result.reason, result.ok ? 'info' : 'critical');
});

let state = {
  zones: [],
  selectedZoneId: null,
  demoZoneId: null,
  activityEvents: [],
  mapOverview: null,
  mapMain: null,
  markersOverview: {},
  markersMain: {},
  heatLayer: null,
  polygonLayers: {},
  heatmapOn: false,
  predictiveBanners: []
};

// ---------------- Navigation ----------------
document.querySelectorAll('#topnav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#topnav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + btn.dataset.view).classList.add('active');
    onViewShown(btn.dataset.view);
  });
});

function onViewShown(view) {
  if (view === 'map') { initMainMap(); renderMapZoneList(); }
  if (view === 'satellite') loadSatelliteView();
  if (view === 'zones') renderZonesList();
  if (view === 'reports') loadReports();
  if (view === 'operations') loadOperations();
  if (view === 'alerts') loadAlerts();
  if (view === 'analytics') loadAnalytics();
  if (view === 'demo') loadDemoPanel();
  if (view === 'admin') loadAdmin();
}

setInterval(() => {
  document.getElementById('clock').textContent = new Date().toLocaleString();
}, 1000);

// ---------------- Socket.io real-time ----------------
const socket = io();
socket.on('connect', () => {
  document.getElementById('live-dot').classList.remove('off');
  document.getElementById('live-label').textContent = 'Live';
});
socket.on('disconnect', () => {
  document.getElementById('live-dot').classList.add('off');
  document.getElementById('live-label').textContent = 'Offline';
});
socket.on('risk:update', (payload) => {
  pushActivity(payload);
  refreshZoneInState(payload);
  loadSummary();
  renderZonesList();
  renderMapZoneList();
  updateMapMarkers();
  if (state.selectedZoneId === payload.zoneId) renderZoneDetail(payload.zoneId);
  if (document.getElementById('view-reports').classList.contains('active')) loadReports();
  if (document.getElementById('view-operations').classList.contains('active')) loadOperations();
  if (document.getElementById('view-demo').classList.contains('active') && state.demoZoneId === payload.zoneId) {
    renderDemoCurrentRisk(payload.prediction);
  }
});
socket.on('alert:new', (alert) => {
  toast(`${alert.level}: ${alert.title}`, alert.level === 'EMERGENCY' || alert.level === 'HIGH ALERT' ? 'critical' : alert.level === 'WARNING' ? 'warning' : 'info');
  if (document.getElementById('view-alerts').classList.contains('active')) loadAlerts();
  loadOverviewAlerts();
});
socket.on('predictive:alert', (p) => {
  toast(`⚡ Predictive: ${p.zoneName} — ${p.message}`, 'warning');
  showPredictiveBanner(p);
});
socket.on('auto:escalation', (data) => {
  toast(`🚨 AUTO-ESCALATION: ${data.zoneName} assigned to ${data.agentName}`, 'critical');
  if (document.getElementById('view-operations').classList.contains('active')) loadOperations();
});
socket.on('report:cluster', (data) => {
  toast(`⚠ ${data.reportCount} reports clustered in ${data.zoneName} — possible active event`, 'critical');
});

function pushActivity(payload) {
  state.activityEvents.unshift(payload);
  state.activityEvents = state.activityEvents.slice(0, 40);
  renderActivityFeed();
}

function refreshZoneInState(payload) {
  const z = state.zones.find(z => z.id === payload.zoneId);
  if (z) {
    z.latestRisk = { risk_level: payload.prediction.riskLevel, final_score: payload.prediction.finalScore, confidence: payload.prediction.confidence, created_at: payload.timestamp };
  }
}

function renderActivityFeed() {
  const el = document.getElementById('activity-feed');
  document.getElementById('feed-count').textContent = `${state.activityEvents.length} events`;
  if (!state.activityEvents.length) { el.innerHTML = '<div class="empty-state">Waiting for system events…</div>'; return; }
  el.innerHTML = state.activityEvents.map(ev => {
    const zone = state.zones.find(z => z.id === ev.zoneId);
    const badge = `<span class="badge ${levelClass(ev.prediction.riskLevel)}">${ev.prediction.riskLevel}</span>`;
    return `<div class="timeline-item">
      <div class="t-dot" style="background:${riskColor(ev.prediction.riskLevel)}"></div>
      <div style="flex:1;">
        <div><strong>${zone ? zone.name : ev.zoneId}</strong> ${badge} <span class="muted">score ${ev.prediction.finalScore} · conf ${ev.prediction.confidence}%</span></div>
        <div class="muted">${ev.reason} <span class="mono">(${ev.triggeredBy})</span></div>
      </div>
      <div class="t-time">${fmtTime(ev.timestamp)}</div>
    </div>`;
  }).join('');
}

// ---------------- Load base data ----------------
async function loadZones() {
  state.zones = await apiGet('/risk-zones');
}

async function loadSummary() {
  const s = await apiGet('/analytics/summary');
  const cards = [
    { label: 'Total Risk Zones', value: s.totalZones, cls: '' },
    { label: 'Low Risk', value: s.low, cls: 'low' },
    { label: 'Medium Risk', value: s.medium, cls: 'medium' },
    { label: 'High Risk', value: s.high, cls: 'high' },
    { label: 'Critical Risk', value: s.critical, cls: 'critical' },
    { label: 'Active Alerts', value: s.activeAlerts, cls: '' },
    { label: 'Pending Reports', value: s.pendingReports, cls: '' },
    { label: 'Active Operations', value: s.activeOperations, cls: '' }
  ];
  document.getElementById('summary-cards').innerHTML = cards.map(c =>
    `<div class="stat ${c.cls}"><div class="stat__value">${c.value}</div><div class="stat__label">${c.label}</div></div>`
  ).join('');
  document.getElementById('overview-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

async function loadOverviewAlerts() {
  const alerts = await apiGet('/alerts?status=ACTIVE');
  const el = document.getElementById('overview-alerts');
  if (!alerts.length) { el.innerHTML = '<div class="empty-state">No active alerts</div>'; return; }
  el.innerHTML = alerts.slice(0, 6).map(a => `
    <div class="timeline-item">
      <div class="t-dot" style="background:${riskColor(a.level === 'EMERGENCY' || a.level === 'HIGH ALERT' ? 'CRITICAL' : a.level === 'WARNING' ? 'HIGH' : 'MEDIUM')}"></div>
      <div style="flex:1;"><strong>${a.title}</strong><div class="muted">${a.zone_name} · ${a.recommended_action}</div></div>
      <div class="t-time">${fmtTime(a.created_at)}</div>
    </div>`).join('');
}

async function loadOverviewReports() {
  const reports = await apiGet('/citizen-reports?status=NEW');
  const el = document.getElementById('overview-reports');
  if (!reports.length) { el.innerHTML = '<div class="empty-state">No pending reports</div>'; return; }
  el.innerHTML = reports.slice(0, 6).map(r => `
    <div class="timeline-item">
      <div class="t-dot"></div>
      <div style="flex:1;"><strong>${r.incident_type}</strong><div class="muted">${r.description || 'No description'}</div></div>
      <div class="t-time">${fmtTime(r.created_at)}</div>
    </div>`).join('');
}

// ---------------- Maps ----------------
function showPredictiveBanner(p) {
  const el = document.getElementById('predictive-banner');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `⚡ <strong>Predictive Alert</strong>: ${p.zoneName} — ${p.message} · <span class="muted">${new Date(p.timestamp).toLocaleTimeString()}</span>`;
  setTimeout(() => { el.style.display = 'none'; }, 30000);
}

function initOverviewMap() {
  if (state.mapOverview) return;
  state.mapOverview = L.map('map-overview').setView([25.578, 91.894], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(state.mapOverview);
  placeMarkers(state.mapOverview, state.markersOverview);
}
function initMainMap() {
  if (state.mapMain) { setTimeout(() => state.mapMain.invalidateSize(), 150); return; }
  state.mapMain = L.map('map').setView([25.578, 91.894], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(state.mapMain);
  placeMarkers(state.mapMain, state.markersMain);
  placeZonePolygons(state.mapMain);
  setTimeout(() => state.mapMain.invalidateSize(), 150);
  // Add heatmap toggle button to map
  const HeatmapControl = L.Control.extend({
    onAdd: () => {
      const btn = L.DomUtil.create('button', '');
      btn.style.cssText = 'background:#fff;border:1px solid #ccc;padding:6px 10px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600;';
      btn.textContent = '🌡 Heatmap';
      btn.title = 'Toggle risk heatmap';
      L.DomEvent.on(btn, 'click', (e) => { L.DomEvent.stopPropagation(e); toggleHeatmap(); });
      return btn;
    }
  });
  new HeatmapControl({ position: 'topright' }).addTo(state.mapMain);
}

function riskIcon(level) {
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${riskColor(level)};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [18, 18], iconAnchor: [9, 9]
  });
}

function placeMarkers(map, store) {
  state.zones.forEach(z => {
    if (!z.latitude) return;
    const level = z.latestRisk?.risk_level || 'LOW';
    const marker = L.marker([z.latitude, z.longitude], { icon: riskIcon(level) }).addTo(map);
    marker.bindPopup(popupHtml(z));
    marker.on('click', () => { state.selectedZoneId = z.id; });
    store[z.id] = marker;
  });
}

// Zone polygons — draw approximate risk area circles around each zone
function placeZonePolygons(map) {
  state.zones.forEach(z => {
    if (!z.latitude) return;
    const level = z.latestRisk?.risk_level || 'LOW';
    const color = riskColor(level);
    const radius = 200 + (z.population / 10); // radius scales with population
    const circle = L.circle([z.latitude, z.longitude], {
      radius,
      color,
      fillColor: color,
      fillOpacity: 0.12,
      weight: 1.5,
      dashArray: '4,4'
    }).addTo(map);
    circle.bindTooltip(`${z.name} · ${level}`, { permanent: false, direction: 'top' });
    state.polygonLayers[z.id] = circle;
  });
}

function updatePolygons() {
  Object.entries(state.polygonLayers).forEach(([id, circle]) => {
    const z = state.zones.find(z => z.id === id);
    if (!z) return;
    const color = riskColor(z.latestRisk?.risk_level || 'LOW');
    circle.setStyle({ color, fillColor: color });
  });
}

function toggleHeatmap() {
  if (!state.mapMain) return;
  if (state.heatmapOn && state.heatLayer) {
    state.mapMain.removeLayer(state.heatLayer);
    state.heatLayer = null;
    state.heatmapOn = false;
    return;
  }
  // Build heatmap data from zone risk scores
  const heatData = state.zones
    .filter(z => z.latitude)
    .map(z => [z.latitude, z.longitude, (z.latestRisk?.final_score || 10) / 100]);
  if (window.L.heatLayer) {
    state.heatLayer = L.heatLayer(heatData, { radius: 45, blur: 35, maxZoom: 17, gradient: { 0.25: '#2f7a4f', 0.5: '#c98a1c', 0.75: '#cb6a2e', 1: '#b23a34' } }).addTo(state.mapMain);
    state.heatmapOn = true;
  } else {
    toast('Load leaflet.heat plugin for heatmap support', 'warning');
  }
}

function popupHtml(z) {
  const r = z.latestRisk;
  return `<div style="min-width:180px;">
    <strong>${z.name}</strong><br/>
    <span class="badge ${levelClass(r?.risk_level)}">${r?.risk_level || 'LOW'}</span>
    <div style="margin-top:4px;">Score: ${r ? Math.round(r.final_score) : '—'} / 100</div>
    <div>Confidence: ${r ? r.confidence : '—'}%</div>
    <div class="muted" style="font-size:11px;">Pop: ${z.population}</div>
  </div>`;
}

function updateMapMarkers() {
  [state.markersOverview, state.markersMain].forEach(store => {
    Object.entries(store).forEach(([id, marker]) => {
      const z = state.zones.find(z => z.id === id);
      if (!z) return;
      const level = z.latestRisk?.risk_level || 'LOW';
      marker.setIcon(riskIcon(level));
      marker.setPopupContent(popupHtml(z));
    });
  });
  updatePolygons();
}

function renderMapZoneList() {
  const el = document.getElementById('map-zone-list');
  if (!el) return;
  el.innerHTML = state.zones.map(z => zoneRowHtml(z)).join('');
  el.querySelectorAll('.zone-row').forEach(row => {
    row.addEventListener('click', () => {
      const zone = state.zones.find(z => z.id === row.dataset.id);
      if (zone && state.mapMain) state.mapMain.setView([zone.latitude, zone.longitude], 16);
      if (state.markersMain[row.dataset.id]) state.markersMain[row.dataset.id].openPopup();
    });
  });
}

function zoneRowHtml(z) {
  const r = z.latestRisk;
  const level = r?.risk_level || 'LOW';
  return `<div class="zone-row" data-id="${z.id}">
    <div class="dot ${levelClass(level)}"></div>
    <div class="zone-row__main">
      <div class="zone-row__name">${z.code} · ${z.name}</div>
      <div class="zone-row__meta">Pop ${z.population} · conf ${r?.confidence ?? '—'}%</div>
    </div>
    <div style="text-align:right;">
      <div class="badge ${levelClass(level)}">${level}</div>
      <div class="zone-row__score">${r ? Math.round(r.final_score) : '—'}</div>
    </div>
  </div>`;
}

// ---------------- Zones view ----------------
function renderZonesList() {
  const el = document.getElementById('zones-list');
  el.innerHTML = state.zones.map(z => zoneRowHtml(z)).join('');
  el.querySelectorAll('.zone-row').forEach(row => {
    row.classList.toggle('selected', row.dataset.id === state.selectedZoneId);
    row.addEventListener('click', () => {
      state.selectedZoneId = row.dataset.id;
      renderZonesList();
      renderZoneDetail(row.dataset.id);
    });
  });
  if (!state.selectedZoneId && state.zones.length) {
    state.selectedZoneId = state.zones[0].id;
    renderZonesList();
    renderZoneDetail(state.selectedZoneId);
  }
}

async function renderZoneDetail(zoneId) {
  const panel = document.getElementById('zone-detail-panel');
  panel.innerHTML = '<div class="card"><div class="empty-state">Loading…</div></div>';
  try {
    const [profile, risk, impact] = await Promise.all([
      apiGet(`/risk-zones/${zoneId}/profile`),
      apiGet(`/risk-zones/${zoneId}/risk`).catch(() => null),
      apiGet(`/risk-zones/${zoneId}/impact`).catch(() => null)
    ]);
    const z = profile.zone;

    const factorsHtml = (risk?.factors || []).map(f => `
      <div class="factor">
        <div>
          <div class="factor__name">${f.name}</div>
          <div class="factor__meta">${f.detail} ${srcTag(f.source, f.status)}</div>
        </div>
        <div class="factor__bar"><div class="factor__fill ${f.level.toLowerCase()}" style="width:${f.contribution}%"></div></div>
        <div class="factor__val">${Math.round(f.contribution)}</div>
      </div>`).join('') || '<div class="empty-state">No factors calculated yet</div>';

    panel.innerHTML = `
      <div class="card">
        <div class="card__head">
          <h2>${z.code} · ${z.name}</h2>
          <span class="badge ${levelClass(risk?.risk_level)}">${risk?.risk_level || 'LOW'}</span>
        </div>
        <div class="grid-3" style="margin-bottom:10px;">
          <div class="stat ${levelClass(risk?.risk_level)}"><div class="stat__value">${risk ? Math.round(risk.final_score) : '—'}</div><div class="stat__label">Risk Score</div></div>
          <div class="stat"><div class="stat__value">${risk ? risk.confidence : '—'}%</div><div class="stat__label">Confidence</div></div>
          <div class="stat"><div class="stat__value">${impact ? impact.impact_score : '—'}</div><div class="stat__label">Impact Score</div></div>
        </div>
        <div class="muted" style="margin-bottom:8px;">
          Static ${risk ? Math.round(risk.static_score) : '—'} · Dynamic ${risk ? Math.round(risk.dynamic_score) : '—'} · Evidence ${risk ? Math.round(risk.evidence_score) : '—'}
          · Last updated ${risk ? timeAgo(risk.created_at) : '—'}
        </div>
        <h3 style="font-size:12.5px;margin:10px 0 4px;">Explainable Primary Factors</h3>
        ${factorsHtml}
      </div>

      <div class="card">
        <div class="card__head"><h2>Digital Monitoring Node</h2><span class="badge outline">${profile.node?.node_type || '—'}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
          <div><strong>Rainfall (24h):</strong> ${profile.weather?.rainfall_24h ?? '—'} mm ${srcTag(profile.weather?.source, profile.weather?.status)}</div>
          <div><strong>Soil Moisture:</strong> ${profile.sensor?.soil_moisture ?? '—'}% ${srcTag(profile.sensor?.source, profile.sensor?.status)}</div>
          <div><strong>Ground Movement:</strong> ${profile.sensor?.ground_movement_mm ?? '—'} mm ${srcTag(profile.sensor?.source, profile.sensor?.status)}</div>
          <div><strong>Satellite Surface Change:</strong> ${profile.satellite?.surface_change ?? '—'} ${srcTag(profile.satellite?.source, profile.satellite?.status)}</div>
          <div><strong>Seismic (Mw):</strong> ${profile.earthquake?.magnitude ?? '—'} ${srcTag(profile.earthquake?.source, profile.earthquake?.status)}</div>
          <div><strong>Slope / Elevation:</strong> ${z.slope_deg}° / ${z.elevation_m} m</div>
        </div>
        <div class="hr"></div>
        <h3 style="font-size:12.5px;margin:0 0 6px;">Historical Events</h3>
        ${profile.historicalEvents.length ? profile.historicalEvents.map(h => `<div class="muted" style="font-size:12px;margin-bottom:4px;">${h.event_date}: ${h.description}</div>`).join('') : '<div class="muted">No recorded events</div>'}
      </div>

      ${impact ? `<div class="card">
        <div class="card__head"><h2>Impact Analysis</h2><span class="badge ${impact.impact_score >= 76 ? 'critical' : impact.impact_score >= 51 ? 'high' : impact.impact_score >= 26 ? 'medium' : 'low'}">${impact.impact_score}/100</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;">
          <div><strong>Population:</strong> ${impact.population}</div>
          <div><strong>Nearby Villages:</strong> ${impact.nearby_villages}</div>
          <div><strong>Road:</strong> ${impact.road_affected}</div>
          <div><strong>Hospitals Nearby:</strong> ${impact.hospitals_nearby}</div>
          <div><strong>Alternative Route:</strong> ${impact.alternative_route}</div>
          <div><strong>Isolation Risk:</strong> ${impact.isolation_risk}</div>
        </div>
      </div>` : ''}
    `;
  } catch (e) {
    panel.innerHTML = `<div class="card"><div class="empty-state">Error loading zone: ${e.message}</div></div>`;
  }
}

// ---------------- Citizen Reports ----------------
async function loadReports() {
  const reports = await apiGet('/citizen-reports');
  const tbody = document.querySelector('#reports-table tbody');
  document.getElementById('reports-empty').style.display = reports.length ? 'none' : 'block';
  tbody.innerHTML = reports.map(r => {
    const zone = state.zones.find(z => z.id === r.risk_zone_id);
    const aiBadge = r.image_analysis
      ? r.image_analysis.match
        ? `<span style="font-size:10px;background:var(--green-soft);color:var(--green);padding:1px 5px;border-radius:2px;">✅ AI match ${r.image_analysis.confidence}%</span>`
        : `<span style="font-size:10px;background:var(--orange-soft);color:var(--orange);padding:1px 5px;border-radius:2px;">⚠ AI ${r.image_analysis.confidence}%</span>`
      : '';
    const photoThumb = r.photo_note?.includes('✅') || r.photo_note?.includes('📷')
      ? `<img src="/api/citizen-reports/${r.id}/photo" style="width:32px;height:32px;object-fit:cover;border-radius:2px;border:1px solid var(--line);cursor:pointer;" onclick="window.open('/api/citizen-reports/${r.id}/photo','_blank')" onerror="this.style.display='none'" title="Click to view full photo">`
      : '';
    return `<tr>
      <td style="white-space:nowrap;">${r.incident_type}</td>
      <td>${zone ? zone.code : '—'}</td>
      <td style="max-width:180px;">${r.description || '<span class="muted">No description</span>'}
        <div style="margin-top:3px;display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
          ${photoThumb} ${aiBadge}
          ${r.latitude ? '<span style="font-size:10px;color:var(--green);">📍 GPS</span>' : ''}
        </div>
      </td>
      <td class="mono" style="font-size:10.5px;">${r.latitude ? r.latitude.toFixed(4) + ', ' + r.longitude.toFixed(4) : '—'}</td>
      <td>${timeAgo(r.created_at)}</td>
      <td><span class="status-pill ${r.status.replace(' ', '_')}">${r.status}</span></td>
      <td>
        <button class="btn btn-sm btn-outline" data-act="review" data-id="${r.id}">Review</button>
        <button class="btn btn-sm btn-success" data-act="verify" data-id="${r.id}">Verify</button>
        <button class="btn btn-sm btn-danger" data-act="reject" data-id="${r.id}">Reject</button>
        <button class="btn btn-sm btn-primary" data-act="assign" data-zone="${r.risk_zone_id}" data-report="${r.id}">Assign Agent</button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      try {
        if (act === 'review') await apiPatch(`/citizen-reports/${btn.dataset.id}`, { status: 'UNDER REVIEW' });
        if (act === 'verify') await apiPatch(`/citizen-reports/${btn.dataset.id}`, { status: 'VERIFIED' });
        if (act === 'reject') await apiPatch(`/citizen-reports/${btn.dataset.id}`, { status: 'REJECTED' });
        if (act === 'assign') { await apiPost('/agent-assignments', { risk_zone_id: btn.dataset.zone, citizen_report_id: btn.dataset.report, priority: 'HIGH' }); toast('Field agent assigned', 'info'); }
        loadReports();
      } catch (e) { toast(e.message, 'critical'); }
    });
  });
}

// ---------------- Operations ----------------
async function loadOperations() {
  const [assignments, agents] = await Promise.all([apiGet('/agent-assignments'), apiGet('/agents')]);
  const tbody = document.querySelector('#assignments-table tbody');
  document.getElementById('assignments-empty').style.display = assignments.length ? 'none' : 'block';
  tbody.innerHTML = assignments.map(a => `<tr>
    <td>${a.zone_code} · ${a.zone_name}</td>
    <td>${agents.find(g => g.id === a.agent_id)?.name || '—'}</td>
    <td><span class="badge ${a.priority === 'CRITICAL' ? 'critical' : a.priority === 'HIGH' ? 'high' : 'medium'}">${a.priority}</span></td>
    <td>${statusSelectHtml(a)}</td>
    <td>${timeAgo(a.created_at)}</td>
  </tr>`).join('');

  tbody.querySelectorAll('select[data-assign]').forEach(sel => {
    sel.addEventListener('change', async () => {
      try { await apiPatch(`/agent-assignments/${sel.dataset.assign}`, { status: sel.value }); toast('Assignment updated', 'info'); loadOperations(); }
      catch (e) { toast(e.message, 'critical'); }
    });
  });

  document.getElementById('agents-list').innerHTML = agents.map(g => `
    <div class="timeline-item">
      <div class="t-dot" style="background:${g.agent_status === 'AVAILABLE' ? '#2f7a4f' : '#c98a1c'}"></div>
      <div style="flex:1;"><strong>${g.name}</strong><div class="muted">${g.phone || ''}</div></div>
      <span class="badge outline">${g.agent_status}</span>
    </div>`).join('');
}

function statusSelectHtml(a) {
  const options = ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED'];
  return `<select data-assign="${a.id}" style="width:auto;padding:4px 6px;">
    ${options.map(o => `<option value="${o}" ${o === a.status ? 'selected' : ''}>${o.replace('_', ' ')}</option>`).join('')}
  </select>`;
}

// ---------------- Alerts ----------------
async function loadAlerts() {
  const alerts = await apiGet('/alerts');
  const tbody = document.querySelector('#alerts-table tbody');
  tbody.innerHTML = alerts.map(a => `<tr>
    <td><span class="badge ${a.level === 'EMERGENCY' || a.level === 'HIGH ALERT' ? 'critical' : a.level === 'WARNING' ? 'high' : a.level === 'WATCH' ? 'medium' : 'low'}">${a.level}</span></td>
    <td>${a.title}</td>
    <td>${a.village_name} / ${a.zone_code}</td>
    <td style="max-width:260px;">${a.recommended_action}</td>
    <td>${timeAgo(a.created_at)}</td>
    <td>
      <select data-alert="${a.id}" style="width:auto;padding:4px 6px;">
        ${['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'EXPIRED'].map(s => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </td>
  </tr>`).join('');
  tbody.querySelectorAll('select[data-alert]').forEach(sel => {
    sel.addEventListener('change', async () => { await apiPatch(`/alerts/${sel.dataset.alert}`, { status: sel.value }); toast('Alert status updated'); });
  });
}

// ---------------- Analytics ----------------
async function loadAnalytics() {
  const sel = document.getElementById('analytics-zone-select');
  if (!sel.dataset.filled) {
    sel.innerHTML = state.zones.map(z => `<option value="${z.id}">${z.code} · ${z.name}</option>`).join('');
    sel.dataset.filled = '1';
    sel.addEventListener('change', renderAnalyticsCharts);
  }
  if (!sel.value && state.zones.length) sel.value = state.zones[0].id;

  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  state.zones.forEach(z => counts[z.latestRisk?.risk_level || 'LOW']++);
  drawBarChart('chart-zones', Object.keys(counts), Object.values(counts), [riskColor('LOW'), riskColor('MEDIUM'), riskColor('HIGH'), riskColor('CRITICAL')]);

  renderAnalyticsCharts();
}

async function renderAnalyticsCharts() {
  const zoneId = document.getElementById('analytics-zone-select').value;
  if (!zoneId) return;
  const trend = await apiGet(`/analytics/risk-trend?risk_zone_id=${zoneId}&limit=40`);
  drawLineChart('chart-trend', trend.map(t => Math.round(t.final_score)), '#22405a');
  const rain = await apiGet(`/analytics/rainfall-trend?risk_zone_id=${zoneId}&limit=40`);
  drawLineChart('chart-rain', rain.map(r => r.rainfall_24h), '#c98a1c');
}

// ---------------- Admin ----------------
async function loadAdmin() {
  const [users, sources, logs] = await Promise.all([apiGet('/users'), apiGet('/data-sources'), apiGet('/audit-logs')]);
  document.querySelector('#users-table tbody').innerHTML = users.map(u =>
    `<tr><td>${u.name}</td><td>${u.email}</td><td><span class="badge outline">${u.role}</span></td><td>${u.status}</td></tr>`).join('');
  document.querySelector('#sources-table tbody').innerHTML = sources.map(s =>
    `<tr><td>${s.name}</td><td>${s.type}</td><td>${Math.round(s.reliability * 100)}%</td><td><span class="badge low">${s.status}</span></td></tr>`).join('');
  document.querySelector('#audit-table tbody').innerHTML = logs.slice(0, 60).map(l =>
    `<tr><td class="mono" style="font-size:11px;">${fmtTime(l.created_at)}</td><td>${l.action}</td><td>${l.entity}</td><td style="max-width:400px;font-size:11px;" class="muted">${l.details}</td></tr>`).join('');
}

// ---------------- Demo Control Panel ----------------
async function loadDemoPanel() {
  const sel = document.getElementById('demo-zone-select');
  if (!sel.dataset.filled) {
    sel.innerHTML = state.zones.map(z => `<option value="${z.id}">${z.code} · ${z.name}</option>`).join('');
    sel.dataset.filled = '1';
    sel.addEventListener('change', () => { state.demoZoneId = sel.value; loadZoneIntoSliders(sel.value); });
  }
  if (!state.demoZoneId) state.demoZoneId = state.zones.find(z => z.code === 'D')?.id || state.zones[0].id;
  sel.value = state.demoZoneId;
  loadZoneIntoSliders(state.demoZoneId);
}

async function loadZoneIntoSliders(zoneId) {
  const profile = await apiGet(`/risk-zones/${zoneId}/profile`);
  document.getElementById('slider-rainfall').value = profile.weather?.rainfall_24h ?? 40;
  document.getElementById('val-rainfall').textContent = `${profile.weather?.rainfall_24h ?? 40} mm`;
  document.getElementById('slider-moisture').value = profile.sensor?.soil_moisture ?? 35;
  document.getElementById('val-moisture').textContent = `${profile.sensor?.soil_moisture ?? 35} %`;
  document.getElementById('slider-movement').value = profile.sensor?.ground_movement_mm ?? 0.5;
  document.getElementById('val-movement').textContent = `${profile.sensor?.ground_movement_mm ?? 0.5} mm`;
  const risk = await apiGet(`/risk-zones/${zoneId}/risk`).catch(() => null);
  renderDemoCurrentRisk(risk ? { riskLevel: risk.risk_level, finalScore: risk.final_score, confidence: risk.confidence } : null);
}

function renderDemoCurrentRisk(r) {
  const el = document.getElementById('demo-current-risk');
  if (!r) { el.innerHTML = '<div class="empty-state">No prediction yet</div>'; return; }
  el.innerHTML = `<div style="display:flex;gap:16px;align-items:center;">
    <span class="badge ${levelClass(r.riskLevel)}" style="font-size:13px;padding:6px 14px;">${r.riskLevel}</span>
    <div>Score: <strong>${Math.round(r.finalScore)}</strong>/100</div>
    <div>Confidence: <strong>${r.confidence}%</strong></div>
  </div>`;
}

function tracePipeline(result) {
  const el = document.getElementById('pipeline-trace');
  if (el.querySelector('.empty-state')) el.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'timeline-item';
  row.innerHTML = `
    <div class="t-dot" style="background:${riskColor(result.prediction.riskLevel)}"></div>
    <div style="flex:1;">
      <strong>${result.reason}</strong>
      <div class="muted">Risk → <span class="badge ${levelClass(result.prediction.riskLevel)}">${result.prediction.riskLevel}</span>
      score ${Math.round(result.prediction.finalScore)} · confidence ${result.prediction.confidence}%
      ${result.alert ? ' · Alert: ' + result.alert.level : ''}
      ${result.decision.requiresAgent ? ' · Agent verification recommended' : ''}</div>
    </div>
    <div class="t-time">${fmtTime(result.timestamp)}</div>`;
  el.prepend(row);
}

function bindSlider(sliderId, valId, unit, fn) {
  const slider = document.getElementById(sliderId);
  let debounce;
  slider.addEventListener('input', () => {
    document.getElementById(valId).textContent = `${slider.value} ${unit}`;
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const result = await fn(Number(slider.value));
      tracePipeline(result);
      renderDemoCurrentRisk(result.prediction);
    }, 350);
  });
}

function initDemoControls() {
  bindSlider('slider-rainfall', 'val-rainfall', 'mm', v => apiPost('/simulation/rainfall', { risk_zone_id: state.demoZoneId, rainfall_24h: v }));
  bindSlider('slider-moisture', 'val-moisture', '%', v => apiPost('/simulation/soil-moisture', { risk_zone_id: state.demoZoneId, soil_moisture: v }));
  bindSlider('slider-movement', 'val-movement', 'mm', v => apiPost('/simulation/ground-movement', { risk_zone_id: state.demoZoneId, ground_movement_mm: v }));

  let satelliteOn = false;
  document.getElementById('btn-satellite').addEventListener('click', async (e) => {
    satelliteOn = !satelliteOn;
    e.target.textContent = satelliteOn ? 'ON → Clear' : 'OFF → Trigger';
    const result = await apiPost('/simulation/satellite-change', { risk_zone_id: state.demoZoneId, enabled: satelliteOn });
    tracePipeline(result); renderDemoCurrentRisk(result.prediction);
  });

  document.getElementById('btn-seismic').addEventListener('click', async () => {
    const result = await apiPost('/simulation/seismic', { risk_zone_id: state.demoZoneId, magnitude: 4.5, distance_km: 30 });
    tracePipeline(result); renderDemoCurrentRisk(result.prediction);
  });

  document.getElementById('btn-reset-zone').addEventListener('click', async () => {
    const result = await apiPost('/simulation/reset', { risk_zone_id: state.demoZoneId });
    tracePipeline(result); renderDemoCurrentRisk(result.prediction);
    loadZoneIntoSliders(state.demoZoneId);
  });

  document.getElementById('btn-add-report').addEventListener('click', async () => {
    const type = document.getElementById('demo-incident-type').value;
    const { pipeline } = await apiPost('/simulation/citizen-report', { risk_zone_id: state.demoZoneId, incident_type: type });
    tracePipeline(pipeline); renderDemoCurrentRisk(pipeline.prediction);
    toast(`Citizen report submitted: ${type}`);
  });

  document.getElementById('btn-assign-agent').addEventListener('click', async () => {
    try {
      const a = await apiPost('/agent-assignments', { risk_zone_id: state.demoZoneId, priority: 'CRITICAL' });
      toast('Agent assignment created — see Emergency Ops tab');
    } catch (e) { toast(e.message, 'critical'); }
  });

  document.getElementById('btn-verify-confirm').addEventListener('click', async () => {
    const { pipeline } = await apiPost('/simulation/field-verification', { risk_zone_id: state.demoZoneId, result: 'CONFIRMED', notes: 'Field agent confirmed active landslide/debris movement on site' });
    tracePipeline(pipeline); renderDemoCurrentRisk(pipeline.prediction);
  });
  document.getElementById('btn-verify-false').addEventListener('click', async () => {
    const { pipeline } = await apiPost('/simulation/field-verification', { risk_zone_id: state.demoZoneId, result: 'FALSE_ALARM', notes: 'Field agent found no landslide indicators on site' });
    tracePipeline(pipeline); renderDemoCurrentRisk(pipeline.prediction);
  });

  document.getElementById('btn-run-scenario').addEventListener('click', runFullScenario);
}

async function runFullScenario() {
  const btn = document.getElementById('btn-run-scenario');
  btn.disabled = true;
  const zoneId = state.demoZoneId;
  const steps = [
    () => apiPost('/simulation/reset', { risk_zone_id: zoneId }),
    () => apiPost('/simulation/rainfall', { risk_zone_id: zoneId, rainfall_24h: 150 }),
    () => apiPost('/simulation/satellite-change', { risk_zone_id: zoneId, enabled: true }),
    () => apiPost('/simulation/citizen-report', { risk_zone_id: zoneId, incident_type: 'Road Crack', description: 'Wide crack observed across the road surface' }).then(r => r.pipeline),
    () => apiPost('/simulation/ground-movement', { risk_zone_id: zoneId, ground_movement_mm: 14 }),
    () => apiPost('/agent-assignments', { risk_zone_id: zoneId, priority: 'CRITICAL' }).then(async () => (await apiGet(`/risk-zones/${zoneId}/risk`))),
    () => apiPost('/simulation/field-verification', { risk_zone_id: zoneId, result: 'CONFIRMED', notes: 'Active debris flow confirmed by field agent, evacuation advised' }).then(r => r.pipeline)
  ];
  for (const step of steps) {
    try {
      const result = await step();
      if (result && result.prediction) { tracePipeline(result); renderDemoCurrentRisk(result.prediction); }
      await new Promise(r => setTimeout(r, 900));
    } catch (e) { toast(e.message, 'critical'); }
  }
  loadZoneIntoSliders(zoneId);
  btn.disabled = false;
  toast('Full demonstration scenario complete', 'critical');
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportDashboard() {
  const w = window.open('', '_blank');
  const ts = new Date().toLocaleString();
  const zoneRows = state.zones.map(z => `
    <tr>
      <td>${z.code}</td><td>${z.name}</td>
      <td><strong>${z.latestRisk?.risk_level || 'LOW'}</strong></td>
      <td>${z.latestRisk?.final_score ? Math.round(z.latestRisk.final_score) : '—'}/100</td>
      <td>${z.latestRisk?.confidence || '—'}%</td>
      <td>${z.population}</td>
    </tr>`).join('');
  w.document.write(`<!DOCTYPE html><html><head><title>NER-LIRP Situation Report</title>
  <style>body{font-family:Arial,sans-serif;padding:20px;color:#111;} table{width:100%;border-collapse:collapse;margin-top:12px;} th,td{padding:8px 10px;border:1px solid #ddd;font-size:12px;} th{background:#0c1620;color:#fff;} .critical{color:#b23a34;font-weight:bold;} .high{color:#cb6a2e;font-weight:bold;} .medium{color:#c98a1c;} .low{color:#2f7a4f;} h1{color:#0c1620;}</style>
  </head><body>
  <h1>NER-LIRP Situation Report</h1>
  <p>Generated: <strong>${ts}</strong> | System: NER-LIRP v1.0 | Status: LIVE</p>
  <h2>Risk Zone Status</h2>
  <table><thead><tr><th>Zone</th><th>Name</th><th>Risk Level</th><th>Score</th><th>Confidence</th><th>Population</th></tr></thead>
  <tbody>${zoneRows}</tbody></table>
  <p style="margin-top:20px;font-size:11px;color:#888;">This report is generated by the NER-LIRP AI-based Early Warning System. For official use only.</p>
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// ── SATELLITE SURVEILLANCE & CHANGE DETECTION ──────────────────────────────
let satState = {
  currentProfile: null,
  activeBand: 'rgb',
  splitPct: 50
};

function initSatelliteViewer() {
  const slider = document.getElementById('sat-split-slider');
  const afterWrap = document.getElementById('sat-after-wrap');
  const handle = document.getElementById('sat-handle');

  if (slider && afterWrap && handle) {
    slider.addEventListener('input', (e) => {
      const val = e.target.value;
      satState.splitPct = val;
      afterWrap.style.width = val + '%';
      handle.style.left = val + '%';
    });
  }

  // Spectral band toggles
  const bandRgb = document.getElementById('band-rgb');
  const bandNdvi = document.getElementById('band-ndvi');
  const bandInsar = document.getElementById('band-insar');
  const imgBefore = document.getElementById('sat-img-before');
  const imgAfter = document.getElementById('sat-img-after');

  function setBand(mode) {
    satState.activeBand = mode;
    [bandRgb, bandNdvi, bandInsar].forEach(b => {
      if (b) {
        b.style.background = 'none';
        b.style.color = '#94a3b8';
      }
    });
    if (imgBefore) imgBefore.className = 'sat-img-layer';
    if (imgAfter) imgAfter.className = '';

    if (mode === 'rgb') {
      if (bandRgb) { bandRgb.style.background = '#1e293b'; bandRgb.style.color = '#fff'; }
    } else if (mode === 'ndvi') {
      if (bandNdvi) { bandNdvi.style.background = '#059669'; bandNdvi.style.color = '#fff'; }
      if (imgBefore) imgBefore.classList.add('sat-filter-ndvi');
      if (imgAfter) imgAfter.classList.add('sat-filter-ndvi');
    } else if (mode === 'insar') {
      if (bandInsar) { bandInsar.style.background = '#d97706'; bandInsar.style.color = '#fff'; }
      if (imgBefore) imgBefore.classList.add('sat-filter-insar');
      if (imgAfter) imgAfter.classList.add('sat-filter-insar');
    }
  }

  if (bandRgb) bandRgb.addEventListener('click', () => setBand('rgb'));
  if (bandNdvi) bandNdvi.addEventListener('click', () => setBand('ndvi'));
  if (bandInsar) bandInsar.addEventListener('click', () => setBand('insar'));

  // Scenario Buttons
  const btnCatastrophic = document.getElementById('btn-sat-catastrophic');
  const btnCreep = document.getElementById('btn-sat-creep');
  const btnBaseline = document.getElementById('btn-sat-baseline');
  const btnRefresh = document.getElementById('btn-trigger-sat-pass');
  const zoneSelect = document.getElementById('sat-zone-selector');

  if (zoneSelect) {
    zoneSelect.addEventListener('change', () => {
      loadSatelliteForZone(zoneSelect.value);
    });
  }

  async function triggerScenario(scenarioType) {
    const zoneId = zoneSelect?.value || state.selectedZoneId || state.zones[0]?.id;
    if (!zoneId) return toast('Please select a risk zone', 'warning');

    toast(`Analyzing Sentinel-2 & InSAR pass (${scenarioType})...`, 'info');
    try {
      const res = await apiPost('/satellite/analyze', { risk_zone_id: zoneId, scenario_type: scenarioType });
      updateSatelliteUI(res.satellite);
      toast('Satellite pass analyzed: Confidence & risk updated!', 'info');
      await loadZones();
      await loadSummary();
    } catch (err) {
      toast('Satellite analysis error: ' + err.message, 'critical');
    }
  }

  if (btnCatastrophic) btnCatastrophic.addEventListener('click', () => triggerScenario('CATASTROPHIC_SLIDE'));
  if (btnCreep) btnCreep.addEventListener('click', () => triggerScenario('MODERATE_CREEP'));
  if (btnBaseline) btnBaseline.addEventListener('click', () => triggerScenario('BASELINE'));
  if (btnRefresh) btnRefresh.addEventListener('click', () => triggerScenario('CATASTROPHIC_SLIDE'));
}

async function loadSatelliteView() {
  const zoneSelect = document.getElementById('sat-zone-selector');
  if (zoneSelect && state.zones.length) {
    zoneSelect.innerHTML = state.zones.map(z => `<option value="${z.id}" ${z.id === (state.selectedZoneId || state.zones[0].id) ? 'selected' : ''}>${z.name} (${z.code})</option>`).join('');
  }
  const targetZoneId = zoneSelect?.value || state.selectedZoneId || state.zones[0]?.id;
  if (targetZoneId) {
    await loadSatelliteForZone(targetZoneId);
  }
}

async function loadSatelliteForZone(zoneId) {
  try {
    const profile = await apiGet(`/satellite/zones/${zoneId}`);
    updateSatelliteUI(profile);
  } catch (err) {
    console.error('[Satellite] Load error:', err);
  }
}

function updateSatelliteUI(data) {
  if (!data) return;
  satState.currentProfile = data;

  const imgBefore = document.getElementById('sat-img-before');
  const imgAfter = document.getElementById('sat-img-after');
  if (imgBefore && data.before_image_url) imgBefore.src = data.before_image_url;
  if (imgAfter && data.after_image_url) imgAfter.src = data.after_image_url;

  const valNdvi = document.getElementById('sat-val-ndvi');
  const subNdvi = document.getElementById('sat-sub-ndvi');
  const valScar = document.getElementById('sat-val-scar');
  const valInsar = document.getElementById('sat-val-insar');
  const valConf = document.getElementById('sat-val-conf');
  const statusBadge = document.getElementById('sat-badge-status');
  const summaryText = document.getElementById('sat-ai-summary');
  const missionName = document.getElementById('sat-mission-name');
  const insarCoherence = document.getElementById('sat-insar-coherence');

  if (valNdvi) {
    valNdvi.textContent = `-${data.vegetation_loss_pct || 0}%`;
    valNdvi.className = (data.vegetation_loss_pct > 20) ? 'sat-hud-val alert' : 'sat-hud-val good';
  }
  if (subNdvi) subNdvi.textContent = `${(data.ndvi_baseline || 0.74).toFixed(2)} ➔ ${(data.ndvi_current || 0.32).toFixed(2)} Index`;
  if (valScar) {
    valScar.textContent = `${(data.scar_area_sqm || 0).toLocaleString()} m²`;
    valScar.className = (data.scar_area_sqm > 0) ? 'sat-hud-val alert' : 'sat-hud-val good';
  }
  if (valInsar) {
    valInsar.textContent = `${data.surface_displacement_cm || 0} cm`;
    valInsar.className = (data.surface_displacement_cm > 2) ? 'sat-hud-val alert' : 'sat-hud-val good';
  }
  if (valConf) {
    valConf.textContent = data.change_detected ? `+${data.confidence_boost || 18}%` : '+0%';
  }
  if (statusBadge) {
    statusBadge.textContent = data.change_detected ? 'VERIFIED LANDSLIDE SCAR' : 'STABLE BASELINE';
    statusBadge.className = data.change_detected ? 'badge red' : 'badge green';
  }
  if (summaryText && data.analysis_summary) summaryText.textContent = data.analysis_summary;
  if (missionName && data.satellite_mission) missionName.textContent = data.satellite_mission;
  if (insarCoherence) insarCoherence.textContent = `${data.insar_coherence || 0.42} (${data.change_detected ? 'Decorrelated' : 'High Coherence'})`;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  await loadZones();
  await loadSummary();
  initOverviewMap();
  await loadOverviewAlerts();
  await loadOverviewReports();
  initDemoControls();
  initSatelliteViewer();
  setInterval(loadSummary, 15000);
  setInterval(loadOverviewAlerts, 15000);
  setInterval(loadOverviewReports, 15000);
  // Wire export button
  const exportBtn = document.getElementById('btn-export');
  if (exportBtn) exportBtn.addEventListener('click', exportDashboard);
}
boot();
`

---

