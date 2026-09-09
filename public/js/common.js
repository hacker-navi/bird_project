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
