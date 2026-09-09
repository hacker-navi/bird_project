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
  vegetation_change: Number,
  surface_change: Number,
  wetness_index: Number,
  land_disturbance: Number,
  source: { type: String, default: 'SIMULATOR' },
  status: { type: String, default: 'DEMO DATA' },
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
