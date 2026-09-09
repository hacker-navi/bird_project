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
