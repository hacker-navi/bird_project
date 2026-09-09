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

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  await loadZones();
  await loadSummary();
  initOverviewMap();
  await loadOverviewAlerts();
  await loadOverviewReports();
  initDemoControls();
  setInterval(loadSummary, 15000);
  setInterval(loadOverviewAlerts, 15000);
  setInterval(loadOverviewReports, 15000);
  // Wire export button
  const exportBtn = document.getElementById('btn-export');
  if (exportBtn) exportBtn.addEventListener('click', exportDashboard);
}
boot();
