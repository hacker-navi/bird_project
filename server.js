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
  // Increased limit for base64 high-resolution satellite & photo uploads (max 25mb)
  app.use(bodyParser.json({ limit: '25mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));
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
