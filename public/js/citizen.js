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
