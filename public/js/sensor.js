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
      } else if (scenarioSelect.value === 'SECTOR2_BARAIL') {
        afterImg.src = '/img/satellite/sector2_after.jpg';
        afterImg.style.borderColor = 'var(--red)';
      } else {
        afterImg.src = '/img/satellite/sector1_after.jpg';
        afterImg.style.borderColor = 'var(--red)';
      }
    });
  }

  const satUploadInput = document.getElementById('sensor-sat-upload');
  let uploadedSatBase64 = null;
  if (satUploadInput) {
    satUploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        uploadedSatBase64 = evt.target.result;
        if (afterImg) afterImg.src = evt.target.result;
        toast('Custom satellite pass loaded — click Run Satellite Analysis', 'info');
      };
      reader.readAsDataURL(file);
    });
  }

  document.getElementById('btn-satellite').addEventListener('click', async () => {
    const scenario = scenarioSelect?.value || 'CATASTROPHIC_SLIDE';
    const statusEl = document.getElementById('sat-sensor-status');
    if (statusEl) statusEl.textContent = '⏳ Processing bi-temporal pass & InSAR fringes...';
    try {
      let res;
      if (uploadedSatBase64) {
        res = await apiPost('/satellite/analyze-custom', {
          risk_zone_id: sState.zoneId,
          after_image_base64: uploadedSatBase64
        });
      } else {
        res = await apiPost('/satellite/analyze', { risk_zone_id: sState.zoneId, scenario_type: scenario });
      }
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
