# NER-LIRP
### North East Region Landslide Intelligence & Response Platform

A working, connected landslide early-warning and emergency-response platform:

```
DATA → INTELLIGENCE → DECISION → ACTION → VERIFICATION → FEEDBACK
```

This build runs on **MongoDB** and sends **real Web Push notifications** —
actual lock-screen alerts on real phones, using the standard browser Push
API (no Firebase/paid account needed). It's designed to run from one
laptop with two phones connected to it, exactly like a real field
deployment:

| Device | Role | URL |
|---|---|---|
| 💻 Laptop | Government/Admin command dashboard | `/` |
| 📱 Phone 1 | Sensor Operator — drives rainfall/soil/ground-movement | `/sensor.html` |
| 📱 Phone 2 | Citizen + Field Agent | `/launcher.html` |

---

## 1. What you need

- **Node.js 18+**
- **MongoDB** — pick one:
  - Local install: [MongoDB Community Server](https://www.mongodb.com/try/download/community) running on default port 27017, **or**
  - Free cloud cluster: [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) (takes ~5 minutes, free tier is enough)
- Two phones with a modern browser (Chrome/Edge on Android, Safari 16.4+ on iOS)

---

## 2. Install & run

```bash
cd ner-lirp
npm install
cp .env.example .env
```

Edit `.env` and set `MONGODB_URI`:
- Local Mongo: `mongodb://127.0.0.1:27017/nerlirp` (already the default)
- Atlas: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/nerlirp`

```bash
npm start
```

On first run this:
1. Connects to MongoDB and seeds Village ABC (zones A–D) + 5 demo users
2. **Generates a real VAPID keypair** for push notifications and saves it to
   `vapid-keys.json`, printing it to the console
3. Starts listening on `http://0.0.0.0:4000` — reachable from your phones
   over WiFi, not just from the laptop itself

**Copy the printed VAPID keys into your `.env` file** so your push identity
stays stable across restarts (otherwise every restart invalidates phone
subscriptions and they'll need to re-enable notifications).

If MongoDB isn't reachable, the server fails fast (within ~5 seconds) with
a clear error telling you to check `MONGODB_URI`, instead of hanging.

### Demo logins (password for all: `demo1234`)

| Role | Email |
|---|---|
| Admin | admin@nerlirp.gov.in |
| Government | gov@nerlirp.gov.in |
| Field Agent | agent1@nerlirp.gov.in / agent2@nerlirp.gov.in |
| Citizen | citizen@example.com |

---

## 3. Getting your phones connected — the HTTPS requirement

Browsers **only allow push notifications and service workers over HTTPS**
(or `localhost`). Your laptop's plain `http://192.168.x.x:4000` LAN address
is enough for reporting/simulating, but the "Enable Real Alerts" buttons
will fail without HTTPS.

The easiest fix, and the one recommended here: **Cloudflare Tunnel**. It's
free, needs no account for a quick tunnel, and gives you an HTTPS URL in
about 10 seconds.

### Step-by-step

1. Install `cloudflared`:
   - macOS: `brew install cloudflared`
   - Windows: download from [github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases)
   - Linux: `curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared.deb`

2. With `npm start` already running in one terminal, open a second terminal:
   ```bash
   cloudflared tunnel --url http://localhost:4000
   ```

3. It prints an HTTPS URL like `https://random-words-1234.trycloudflare.com`
   — this is now your platform's public address for this session.

4. **On your laptop**: open that HTTPS URL in your browser (not
   `localhost`) → this is your Government Dashboard. Click **🔔 Enable
   Alerts** in the top bar.

5. **On Phone 1**: open `<tunnel-url>/sensor.html` → browser menu → **Add
   to Home Screen** → open the installed app → log in as
   `gov@nerlirp.gov.in` → tap **Enable Real Push Alerts on This Phone**.

6. **On Phone 2**: open `<tunnel-url>/launcher.html` → **Add to Home
   Screen** → open it → pick a zone → tap **Enable Real Alerts for This
   Area** → then tap **Citizen Mode** or **Field Agent Mode** to log in
   and use those apps (they share the same install).

> The quick tunnel URL changes every time you restart `cloudflared`. For a
> stable URL across sessions, create a free Cloudflare account and run a
> [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/) instead — same idea, persistent address.

**No internet available?** Use [mkcert](https://github.com/FiloSottile/mkcert)
to generate a locally-trusted HTTPS certificate for your laptop's LAN IP,
point Express at it with `https.createServer`, and install the mkcert root
CA on both phones. This works fully offline but takes a bit more setup —
ask if you want the exact steps for your OS.

---

## 4. Running a real demo

With all three devices connected and push-enabled:

1. **Phone 1 (Sensor Operator)**: drag the Rainfall slider up past ~120mm
   for Zone D. Watch the risk level climb toward HIGH in real time on the
   laptop dashboard (Socket.IO — no refresh needed).
2. Toggle **Satellite Surface Change** on. Confidence rises.
3. **Phone 2 (Citizen mode)**: submit a "Road Crack" report for Zone D
   with a simulated photo and GPS capture.
4. Watch the risk cross into CRITICAL — a **real push notification**
   should land on Phone 1, Phone 2, and the laptop within a couple of
   seconds (assuming all three enabled alerts).
5. **Laptop dashboard → Emergency Ops**: assign a field agent.
6. **Phone 2 → switch to Field Agent mode**, log in as `agent1@nerlirp.gov.in`,
   open the assignment, and submit a **Confirmed** field verification.
7. Watch confidence jump to ~90%+ and the alert/decision update everywhere.

The **Demo Control Panel** tab on the laptop dashboard still has the full
slider set too (useful if you want to drive the scenario from the laptop
instead of Phone 1), plus a **"Run Full Demo Scenario"** one-click replay
of this exact story.

Use **🔔 Send Test Notification** on the Phone 2 launcher page any time to
confirm push is actually reaching a device, independent of the risk engine.

---

## 5. Architecture

```
public/                       Government Dashboard, Citizen/Agent/Sensor apps
  index.html                   government command dashboard
  citizen.html                  citizen mobile-app screens
  agent.html                     field agent mobile-app screens
  sensor.html                     sensor operator console (Phone 1)
  launcher.html                    Phone 2 home (Citizen + Agent picker)
  sw.js                             shared service worker (push + offline shell)
  manifest-*.json                   one installable-app manifest per role
  icons/                              generated PWA icons per role
  js/push-client.js                    real Web Push subscribe/unsubscribe helper

server.js                     Express + Socket.IO + Mongo bootstrap
db/
  mongoose.js                  connection + clean `id` JSON transform
  models.js                     17 Mongoose schemas (snake_case fields)
  seed.js                        demo data: Village ABC, zones A–D, users
  simpleHash.js                    password hashing (swap for bcrypt for real prod)

services/
  riskEngine.js                3-layer risk model + explainable AI + confidence
  impactEngine.js                population / roads / isolation impact analysis
  decisionEngine.js                risk+impact → recommended action + alert level
  pushService.js                     real VAPID Web Push send/subscribe logic
  pipeline.js                          orchestrates the full closed loop:
                                        recalc → impact → decision → alert → PUSH → broadcast

routes/                       REST API — see API reference below
```

### The core monitoring hierarchy

```
State → District → Village → Risk Zone → Digital Monitoring Node
```

Seeded example — **Village ABC**, four zones with different terrain:

| Zone | Description | Node type | Static susceptibility |
|---|---|---|---|
| A | Riverside slope | Virtual | Low |
| B | Mid-hill settlement | Virtual | Medium |
| C | Upper ridge road | Real Sensor | Medium-High |
| D | Steep NH cut-slope | Hybrid | High |

### Risk engine — three layers, fused

1. **Static Susceptibility** (slope, soil, land cover, historical
   landslide count) — changes slowly.
2. **Dynamic Trigger Analysis** (rainfall, soil moisture, ground
   movement, satellite change, seismic activity) — changes continuously.
3. **Real-World Evidence** (citizen reports, field verification) —
   confirms or overrides the model.

`finalScore = 0.35·static + 0.45·dynamic + 0.20·evidence`, mapped to
LOW / MEDIUM / HIGH / CRITICAL (thresholds configurable in
`services/riskEngine.js:levelFromScore`).

A separate **confidence score** is computed from data availability,
freshness, source agreement, and field verification.

Every prediction stores its top 5 **explainable primary factors**, each
tagged with its data source and honesty status (`LIVE`, `MODELLED`,
`ESTIMATED`, `SIMULATED`, `VERIFIED`) — nothing simulated is ever labeled
as real.

### Real push notifications — how targeting works

Every device that taps "Enable Alerts" registers a `PushSubscription`
document with:
- `app_role`: `CITIZEN` / `FIELD_AGENT` / `GOVERNMENT` / `ADMIN`
- `watch_zone_id`: which risk zone this device cares about

When the pipeline issues a `WARNING`, `HIGH ALERT`, or `EMERGENCY` alert,
`services/pushService.js` sends a real push to:
- every device watching that specific zone, **plus**
- every `GOVERNMENT`/`ADMIN` device (command staff always sees everything)

Dead subscriptions (uninstalled app, revoked permission) are detected via
HTTP 404/410 from the push service and cleaned up automatically.

> **Note on Phone 2 sharing one device between Citizen and Agent modes:**
> a browser only has one push subscription per origin. If you enable
> alerts from the launcher, then later re-enable from inside Agent mode
> with a different zone, the most recent registration wins — that's a
> platform limitation, not a bug. For genuinely separate citizen and agent
> push identities, use two different phones or two different browsers.

---

## 6. API reference (selected)

Full route list in `routes/*.js`. All JSON, all under `/api`.

```
POST /auth/register | /auth/login | /auth/logout | GET /auth/profile

GET  /states | /districts | /villages | /risk-zones | /risk-zones/:id
GET  /risk-zones/:id/profile        digital monitoring node full profile
GET  /risk-zones/:id/risk           latest explainable prediction
GET  /risk-zones/:id/impact         latest impact assessment
POST /risk/calculate                manual recalculation

POST /citizen-reports  | GET /citizen-reports | PATCH /citizen-reports/:id
GET  /agents | POST /agent-assignments | PATCH /agent-assignments/:id
POST /field-reports

GET  /alerts | POST /alerts | PATCH /alerts/:id

POST /simulation/rainfall
POST /simulation/soil-moisture
POST /simulation/ground-movement
POST /simulation/satellite-change
POST /simulation/seismic
POST /simulation/citizen-report
POST /simulation/field-verification
POST /simulation/reset

GET  /push/vapid-public-key
POST /push/subscribe            { subscription, userId?, deviceLabel, appRole, watchZoneId? }
POST /push/unsubscribe          { endpoint }
POST /push/test                 { watch_zone_id }   — sends a real test notification

GET  /analytics/summary | /analytics/risk-trend | /analytics/rainfall-trend
GET  /audit-logs | /data-sources | /users
```

Socket.IO events broadcast to every connected client: `risk:update`,
`alert:new`.

---

## 7. What's real vs. what's a stand-in for this build

Honest by design — this doesn't pretend to be something it isn't:

| Area | This build | Path to fully hosted production |
|---|---|---|
| Push notifications | **Real** — standard Web Push API, real VAPID keys, real browser push service (FCM/APNs under the hood). Lands on the actual lock screen. | Same code works as-is once deployed to a real domain; no change needed |
| Database | **Real MongoDB** (yours — local or Atlas) | Already production-shaped; just point `MONGODB_URI` at a managed cluster |
| Install as app | **Real PWA** — installable, offline app-shell, own icon | Same code; for app-store presence, wrap with Capacitor/Trusted Web Activity |
| Networking | Your laptop + Cloudflare quick tunnel (ephemeral URL) | Named Cloudflare Tunnel, or deploy the Node app to Render/Railway/Fly.io with a real domain |
| Weather / satellite / seismic data | Simulated via Sensor Operator app; one real ingestion endpoint (`POST /weather/ingest`) is wired end-to-end as a template | Connect IMD/OpenWeather, ISRO Bhuvan/Sentinel Hub, USGS feeds into the same ingestion endpoint |
| Auth | Opaque token = user id, salted SHA-256 hash | Swap for JWT + refresh tokens + bcrypt/argon2 |
| Media uploads | Text placeholders ("photo attached") | Object storage (S3/GCS) + multipart upload |
| SMS | Not included — push notifications are the real channel here | Twilio/SMS gateway for feature-phone reach |

---

## 8. Project structure

```
ner-lirp/
├── package.json
├── .env.example
├── server.js
├── db/
│   ├── mongoose.js
│   ├── models.js
│   ├── seed.js
│   └── simpleHash.js
├── services/
│   ├── riskEngine.js
│   ├── impactEngine.js
│   ├── decisionEngine.js
│   ├── pushService.js
│   └── pipeline.js
├── routes/
│   ├── auth.js
│   ├── locations.js
│   ├── monitoring.js
│   ├── weather.js
│   ├── risk.js
│   ├── citizenReports.js
│   ├── agents.js
│   ├── alerts.js
│   ├── simulation.js
│   ├── analytics.js
│   └── push.js
└── public/
    ├── index.html          (Government Dashboard — laptop)
    ├── citizen.html         (Citizen App)
    ├── agent.html            (Field Agent App)
    ├── sensor.html            (Sensor Operator console — Phone 1)
    ├── launcher.html           (Phone 2 home — Citizen + Agent picker)
    ├── sw.js                    (shared service worker)
    ├── manifest-*.json           (one per app role)
    ├── icons/
    └── js/
        ├── common.js
        ├── push-client.js
        ├── dashboard.js
        ├── citizen.js
        ├── agent.js
        └── sensor.js
```

---

## 9. A note on how this was verified

This build was checked as thoroughly as possible without a live MongoDB
available in the environment it was built in: every file was syntax- and
load-checked, and every Mongoose model/field reference was cross-verified
against the schema by static analysis. One real bug (a field-naming
mismatch in the push subscription code, which would have silently broken
all push targeting) was caught and fixed this way. It has **not** been
run end-to-end against a live database and real phones. Please treat the
first run as a shakedown — if something doesn't behave as documented,
it's most likely a small wiring issue rather than a structural one, and
worth reporting back so it can be fixed.
