import express from 'express';
import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
const { Pool } = pkg;

const app = express();

// Serve static assets (e.g., real logo files) from ./public
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

const port = parseInt(process.env.LANDING_PORT || '3005', 10);
const ooPublicUrl = process.env.OO_PUBLIC_URL || 'http://localhost:3031';
const firPublicUrl = process.env.FIR_PUBLIC_URL || 'http://localhost:3032';
const grafanaPublicUrl = process.env.GRAFANA_PUBLIC_URL || 'http://localhost:3033';
// Internal URLs (inside Docker network) used for health pings
const ooInternalUrl = process.env.OO_INTERNAL_URL || 'http://openobserve:5080';
const firInternalUrl = process.env.FIR_INTERNAL_URL || 'http://fir:3006';
const grafanaInternalUrl = process.env.GRAFANA_INTERNAL_URL || 'http://grafana:3000';
const simulatorInternalUrl = process.env.SIMULATOR_INTERNAL_URL || 'http://simulator:3010';
// ERP / MES-lite
const erpAdapterInternalUrl = process.env.ERP_ADAPTER_INTERNAL_URL || 'http://erp-adapter:3034';
const erpAdapterPublicUrl = process.env.ERP_ADAPTER_PUBLIC_URL || 'http://localhost:3040';
const erpUrl = process.env.ERP_URL || '';
const erpDemoEnabled = String(process.env.ERP_DEMO_ENABLED || '1') === '1';
// ERPNext (mes profile) detection
const erpInternalUrl = process.env.ERP_INTERNAL_URL || 'http://erpnext:8080';
const erpSiteName = process.env.ERP_SITE_NAME || 'site.local';
const mesProfileFlag = String(process.env.MES_PROFILE || '0') === '1';
const erpMesHostPort = String(process.env.ERP_MES_HOST_PORT || '3036');
// ERP Bridge
const erpBridgeInternalUrl = process.env.ERP_BRIDGE_INTERNAL_URL || 'http://erp-bridge:3037';
const erpBridgePublicUrl = process.env.ERP_BRIDGE_PUBLIC_URL || 'http://localhost:3041';

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: parseInt(process.env.PGPORT || '5432', 10),
  max: 2,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 2_000,
});

async function checkDb() {
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(id) };
}

async function ping(url, pathCandidates) {
  for (const path of pathCandidates) {
    try {
      const { signal, cancel } = timeoutSignal(3000);
      const resp = await fetch(`${url}${path}`, { method: 'GET', signal });
      cancel();
      if (resp.ok) return { ok: true, url: `${url}${path}`, status: resp.status };
      // Non-OK; capture status
      return { ok: false, status: resp.status, error: `HTTP ${resp.status}` };
    } catch (_e) {
      // try next path
    }
  }
  return { ok: false, error: 'unreachable' };
}

async function simulatorStatus() {
  try {
    const { signal, cancel } = timeoutSignal(1500);
    const resp = await fetch(`${simulatorInternalUrl}/healthz`, { signal });
    cancel();
    if (!resp.ok) return { ok: false };
    const data = await resp.json();
    return { ok: true, running: Boolean(data.running), ticks: data.ticks, sent: data.sent, lastValue: data.lastValue, lastError: data.lastError, seeded: data.seeded };
  } catch (_e) {
    return { ok: false };
  }
}

async function erpAdapterStatus() {
  try {
    const { signal, cancel } = timeoutSignal(1500);
    const r = await fetch(`${erpAdapterInternalUrl}/healthz`, { signal });
    cancel();
    if (!r.ok) return { ok: false };
    const j = await r.json().catch(() => ({}));
    return { ok: true, mode: j.mode || (erpUrl ? 'real' : (erpDemoEnabled ? 'simulated' : 'disabled')) };
  } catch (_e) {
    return { ok: false };
  }
}

async function erpMesStatus() {
  try {
    const { signal, cancel } = timeoutSignal(2000);
    const r = await fetch(`${erpInternalUrl}/api/method/ping`, {
      headers: { 'Accept': 'application/json', 'Host': erpSiteName, 'X-Frappe-Site-Name': erpSiteName },
      signal,
    });
    cancel();
    if (!r.ok) return { ok: false };
    const j = await r.json().catch(() => ({}));
    const ok = j && (j.message === 'pong');
    return { ok };
  } catch (_e) {
    return { ok: false };
  }
}

async function erpBridgeStatus() {
  try {
    const { signal, cancel } = timeoutSignal(1500);
    const r = await fetch(`${erpBridgeInternalUrl}/healthz`, { signal });
    cancel();
    if (!r.ok) return { ok: false };
    const j = await r.json().catch(() => ({}));
    const cooldownMs = (j && typeof j.cooldown_remaining_ms === 'number') ? j.cooldown_remaining_ms : 0;
    return { ok: true, cooldownMs };
  } catch (_e) {
    return { ok: false };
  }
}

// Phase A: HTTP server reachable (e.g., Nginx up) even if site not created yet
async function erpPhaseAStatus() {
  try {
    const { signal, cancel } = timeoutSignal(1000);
    const r = await fetch(`${erpInternalUrl}/`, { method: 'GET', signal, headers: { 'Host': erpSiteName, 'X-Frappe-Site-Name': erpSiteName } });
    cancel();
    // Any HTTP response indicates TCP/HTTP is up
    return { ok: r.ok || (r.status >= 200 && r.status < 600) };
  } catch (_e) {
    return { ok: false };
  }
}

// Favicon: a purple square with a white H
app.get('/favicon.svg', (_req, res) => {
  const brand = '#8000ff';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect x="0" y="0" width="64" height="64" rx="12" fill="${brand}"/>
  <!-- Purple H rendered as white negative space -->
  <rect x="16" y="10" width="8" height="44" rx="2" fill="#ffffff"/>
  <rect x="40" y="10" width="8" height="44" rx="2" fill="#ffffff"/>
  <rect x="20" y="28" width="24" height="8" rx="2" fill="#ffffff"/>
</svg>`;
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('image/svg+xml').status(200).send(svg);
});

// Header logo: a purple mark on white
app.get('/logo.svg', (_req, res) => {
  const brand = '#8000ff';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <!-- Purple vertical bar -->
  <rect x="29" y="6" width="6" height="52" rx="3" fill="${brand}"/>
  <!-- Four purple quarter-circles -->
  <defs>
    <clipPath id="ctl"><rect x="6" y="6" width="20" height="20"/></clipPath>
    <clipPath id="ctr"><rect x="38" y="6" width="20" height="20"/></clipPath>
    <clipPath id="cbl"><rect x="6" y="38" width="20" height="20"/></clipPath>
    <clipPath id="cbr"><rect x="38" y="38" width="20" height="20"/></clipPath>
  </defs>
  <circle cx="20" cy="20" r="14" fill="${brand}" clip-path="url(#ctl)"/>
  <circle cx="44" cy="20" r="14" fill="${brand}" clip-path="url(#ctr)"/>
  <circle cx="20" cy="44" r="14" fill="${brand}" clip-path="url(#cbl)"/>
  <circle cx="44" cy="44" r="14" fill="${brand}" clip-path="url(#cbr)"/>
</svg>`;
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('image/svg+xml').status(200).send(svg);
});

app.get('/healthz', async (_req, res) => {
  const db = await checkDb();
  const ok = db.ok === true;
  res.status(ok ? 200 : 503).json({ ok, db });
});

app.post('/api/simulator/start', async (_req, res) => {
  try {
    const { signal, cancel } = timeoutSignal(2000);
    const r = await fetch(`${simulatorInternalUrl}/start`, { method: 'POST', signal });
    cancel();
    const json = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 500).json({ ok: r.ok, ...json });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/simulator/stop', async (_req, res) => {
  try {
    const { signal, cancel } = timeoutSignal(2000);
    const r = await fetch(`${simulatorInternalUrl}/stop`, { method: 'POST', signal });
    cancel();
    const json = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 500).json({ ok: r.ok, ...json });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get('/api/simulator/status', async (_req, res) => {
  try {
    const s = await simulatorStatus();
    res.status(200).json({ ok: true, ...s });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get('/', async (_req, res) => {
  const [db, oo, fir, graf, sim, erpA, erpMes, erpPhaseA, erpBridge] = await Promise.all([
    checkDb(),
    ping(ooInternalUrl, ['/healthz', '/']),
    ping(firInternalUrl, ['/healthz', '/']),
    ping(grafanaInternalUrl, ['/api/health', '/login']),
    simulatorStatus(),
    erpAdapterStatus(),
    erpMesStatus(),
    erpPhaseAStatus(),
    erpBridgeStatus(),
  ]);

  // Enable button if ERP is reachable at HTTP level (Phase A) even if ping isn't yet "pong"
  const erpButtonUrl = erpUrl || (((erpMes && erpMes.ok) || (erpPhaseA && erpPhaseA.ok)) ? `http://localhost:${erpMesHostPort}` : '');
  const erpBadge = (erpMes && erpMes.ok)
    ? `<span class="badge ok" title="ERPNext mes profile ready">ERP (mes)</span>`
    : ((erpPhaseA && erpPhaseA.ok) || mesProfileFlag
        ? `<span class="badge init" title="ERPNext is starting. Its first boot is slow; wait and refresh.">initializing…</span>`
        : ``);

  const svc = [
    { name: 'Postgres', desc: 'Primary database', ok: db.ok, error: db.error },
    { name: 'OpenObserve', desc: 'Logs & observability', ok: oo.ok, open: ooPublicUrl, error: oo.error },
    { name: 'FIR (case tracker)', desc: 'Minimal demo case tracker', ok: fir.ok, open: firPublicUrl, error: fir.error },
    { name: 'Grafana', desc: 'Dashboards & metrics', ok: graf.ok, open: grafanaPublicUrl, error: graf.error },
    { name: 'erp-adapter', desc: `ERP event relay${(!erpUrl && erpDemoEnabled) ? ' • no ERP configured' : ''}`, ok: erpA.ok, open: erpAdapterPublicUrl, error: erpA.error },
    { name: 'erp-bridge', desc: `ERPNext event bridge${(erpBridge && erpBridge.ok && erpBridge.cooldownMs>0) ? ` • cooldown ${Math.ceil(erpBridge.cooldownMs/1000)}s` : ''}`, ok: erpBridge.ok, open: erpBridgePublicUrl, error: erpBridge.error },
  ];

  const brand = '#8000ff';

  const html = `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Trust Stack Demo: status</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <style>
      :root{
        --brand:${brand}; /* primary color */
        --accent-orange:#FF9900; /* accent color */
        --accent-orange-dark:#F39200;
        --ink:#0f172a;
        --muted:#64748b;
        --card:#ffffff;
        --ok:#16a34a;
        --bad:#dc2626;
        --border:#e2e8f0;
      }
      *{box-sizing:border-box}
      body{
        margin:0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        color:var(--ink);
        background:
          radial-gradient(1200px 600px at -10% -10%, rgba(128,0,255,0.10), transparent 60%),
          radial-gradient(1000px 500px at 110% 110%, rgba(255,153,0,0.06), transparent 60%),
          #ffffff;
      }
      a{color:inherit}
      .container{max-width:1080px;margin:0 auto;padding:28px 20px 60px}
      .hero{display:flex;align-items:center;gap:16px;margin-bottom:20px;padding:16px 0;background:linear-gradient(90deg,var(--brand) 0%,var(--brand) 60%,var(--accent-orange) 100%);background-size:100% 2px;background-repeat:no-repeat;background-position:0 100%}
      .brand{display:flex;flex-direction:column}
      .brand .name{font-size:28px;font-weight:800;letter-spacing:0.2px;color:var(--brand)}
      .brand .suite{font-size:14px;color:var(--muted);font-weight:600}
      .brand .tagline{font-size:13px;color:var(--muted);line-height:1.45;max-width:60ch;margin-top:2px}
      .card{background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:0 8px 24px rgba(2,6,23,0.06);padding:24px;position:relative;overflow:hidden}
      .card::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--brand) 0%,var(--brand) 60%,var(--accent-orange) 100%)}
      .intro{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:8px}
      .intro .left{display:flex;flex-direction:column;gap:6px}
      .intro .title{font-weight:800;font-size:20px;color:var(--brand)}
      .intro .subtitle{color:var(--muted)}
      .cta{display:inline-flex;align-items:center;gap:8px;border:none;border-radius:12px;padding:12px 18px;font-weight:700;text-decoration:none;transition:all 0.2s ease}
      .cta.primary{background:linear-gradient(135deg,var(--brand) 0%,#9333ea 100%);color:#fff;box-shadow:0 6px 16px rgba(128,0,255,0.35)}
      .cta.primary:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(128,0,255,0.45)}
      .cta.secondary{background:linear-gradient(135deg,var(--accent-orange) 0%,var(--accent-orange-dark) 100%);color:#000;box-shadow:0 6px 16px rgba(255,153,0,0.35)}
      .cta.secondary:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(255,153,0,0.45)}
      .rows{margin-top:6px}
      .row{display:flex;align-items:center;justify-content:space-between;padding:14px 10px;border-bottom:1px solid var(--border);border-radius:8px;transition:all 0.2s ease}
      .row:hover{background:linear-gradient(90deg,rgba(128,0,255,0.03) 0%,rgba(255,153,0,0.02) 100%);padding-left:14px}
      .row:last-child{border-bottom:none}
      .left-side{display:flex;align-items:center;gap:12px}
      .left-side > div .service-name{font-weight:700;font-size:16px;color:var(--brand);margin-bottom:2px}
      .dot{width:10px;height:10px;border-radius:9999px;display:inline-block}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
      .dot.healthy{animation:pulse 2s ease-in-out infinite}
      .badge{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:9999px;color:white;font-weight:700;font-size:14px;text-decoration:none;transition:all 0.2s ease}
      .badge.open{background:var(--brand);box-shadow:0 4px 12px rgba(128,0,255,0.35)}
      .badge.open:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(128,0,255,0.45)}
      .badge.ok{background:var(--ok)}
      .badge.bad{background:var(--bad)}
      .badge.init{background:#f59e0b;color:#111827}
      .dot.planned{opacity:0.6}
      .badge.planned{background:#9ca3af}
      .desc{font-size:12px;color:var(--muted)}
      .foot{margin-top:14px;color:var(--muted);font-size:13px}
      .links{margin-top:8px}
      .links a{color:var(--brand);font-weight:700;text-decoration:none}
      .sim-controls{margin-top:16px;display:flex;align-items:center;gap:12px}
      .btn{display:inline-flex;align-items:center;gap:8px;background:var(--brand);color:#fff;border:none;border-radius:12px;padding:10px 14px;font-weight:700;text-decoration:none;box-shadow:0 4px 12px rgba(128,0,255,0.35);cursor:pointer;transition:all 0.2s ease}
      .btn:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(128,0,255,0.45)}
      .btn.stop{background:#7c2d12}
    </style>
  </head>
  <body>
    <div class="container">
      <div class="hero" role="banner" aria-label="Trust Stack Demo">
        <div class="brand">
          <div class="name">Trust Stack Demo</div>
          <div class="suite">Local demo stack</div>
          <div class="tagline">Telemetry, anomaly detection and a hashed record, end to end</div>
        </div>
      </div>

      <div class="card">
        <div class="intro">
          <div class="left">
            <div class="title">Local Stack Status</div>
            <div class="subtitle">Quick view of core services.</div>
          </div>
        </div>

        <div class="rows">
          ${svc.map(s => `
            <div class="row">
              <div class="left-side">
                <span class="dot ${s.planned ? 'planned' : (s.ok ? 'healthy' : '')}" style="background:${s.planned ? '#9ca3af' : (s.ok ? 'var(--ok)' : 'var(--bad)')}"></span>
                <div>
                  <div class="service-name">${s.name}</div>
                  <div class="desc">${s.desc || ''}${!s.ok && s.error ? ' • ' + s.error : ''}</div>
                </div>
              </div>
              <div>
                ${s.open
                  ? `<a href="${s.open}" target="_blank" class="badge open" rel="noopener">Open</a>`
                  : (s.planned
                      ? `<span class=\"badge planned\">coming</span>`
                      : `<span class=\"badge ${s.ok ? 'ok' : 'bad'}\">${s.ok ? 'healthy' : 'unhealthy'}</span>`)}
              </div>
            </div>`).join('')}
        </div>

        <div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <a href="${grafanaPublicUrl}/d/truststack-demo/truststack-demo" target="_blank" class="cta primary" rel="noopener">Open Demo Dashboard</a>
          ${erpButtonUrl
            ? `<a href="${erpButtonUrl}" target="_blank" class="cta secondary" rel="noopener" title="ERPNext">ERPNext</a>`
            : `<span class="cta secondary" style="opacity:0.6;pointer-events:none" title="Not configured">ERPNext</span>`}
          ${erpBadge}
        </div>

        <div class="sim-controls">
          <div>
            <div id="sim-state" class="desc">Simulator: ${sim.ok ? (sim.running ? 'running' : 'paused') : 'unavailable'}</div>
            <div class="desc" id="sim-counters">${sim.ok ? `ticks=${sim.ticks ?? ''} • sent=${sim.sent ?? ''}` : ''}</div>
          </div>
          <button id="sim-start" class="btn" type="button">Start</button>
          <button id="sim-stop" class="btn stop" type="button">Stop</button>
          <canvas id="sim-spark" width="160" height="28" style="background:#fff;border-radius:6px;border:1px solid #eef2f7"></canvas>
        </div>

        ${db.ok ? '' : `<div class="foot">DB error: ${db.error}</div>`}
        <div class="foot">
          <div class="links"><a href="http://127.0.0.1:${process.env.FAQ_HOST_PORT || '3034'}" target="_blank" rel="noopener">FAQs and demo logins</a></div>
        </div>
      </div>
    </div>
    <script>
    (function(){
      const startBtn = document.getElementById('sim-start');
      const stopBtn = document.getElementById('sim-stop');
      const stateEl = document.getElementById('sim-state');
      const ctrEl = document.getElementById('sim-counters');
      const canvas = document.getElementById('sim-spark');
      const ctx = canvas.getContext('2d');
      const series = [];
      const maxPoints = 40;

      function drawSpark(){
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0,0,w,h);
        if (!series.length) return;
        const min=0,max=100;
        ctx.beginPath(); ctx.strokeStyle = '#8000ff'; ctx.lineWidth=2;
        series.forEach((v,i)=>{
          const x = (i/Math.max(1,series.length-1))*(w-6)+3;
          const y = h-3 - ((v-min)/(max-min))*(h-6);
          if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        });
        ctx.stroke();
      }

      async function refresh(){
        try{
          const r = await fetch('/api/simulator/status', { cache:'no-store' });
          if(!r.ok) throw new Error('status '+r.status);
          const s = await r.json();
          const running = !!s.running;
          stateEl.textContent = 'Simulator: ' + (running ? 'running' : 'paused');
          ctrEl.textContent = (s.ticks!=null && s.sent!=null) ? ('ticks=' + s.ticks + ' • sent=' + s.sent) : '';
          if (s.lastError) { ctrEl.textContent += ' • err=' + s.lastError; }
          const v = typeof s.lastValue === 'number' ? s.lastValue : (typeof s.ticks==='number'? (s.ticks%100) : null);
          if (v!=null){ series.push(v); while(series.length>maxPoints) series.shift(); drawSpark(); }
          startBtn.disabled = running; stopBtn.disabled = !running;
        }catch(e){
          stateEl.textContent = 'Simulator: unavailable';
          startBtn.disabled = false; stopBtn.disabled = true;
        }
      }

      async function post(action){
        const btn = action==='start'? startBtn : stopBtn; btn.disabled = true;
        try{ await fetch('/api/simulator/'+action, { method:'POST' }); }catch(_e){}
        await refresh();
      }

      startBtn.addEventListener('click', ()=>post('start'));
      stopBtn.addEventListener('click', ()=>post('stop'));

      refresh(); setInterval(refresh, 1000);
    })();
    </script>
  </body>
  </html>`;
  res.status(200).send(html);
});

// Lightweight FAQs server on a separate internal port
const faqInternalPort = parseInt(process.env.FAQ_INTERNAL_PORT || '3007', 10);
const faq = express();

faq.get('/', (_req, res) => {
  const html = `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Trust Stack Demo: FAQs</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <style>
      body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;background:#fff}
      .wrap{max-width:720px;margin:0 auto;padding:28px 20px}
      h1{font-size:22px;margin:0 0 12px;color:#8000ff}
      .card{background:#fff;border:1px solid #eef2f7;border-radius:14px;box-shadow:0 8px 24px rgba(2,6,23,0.06);padding:20px}
      code{background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:2px 6px}
      .muted{color:#64748b}
      ul{margin-top:8px}
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Trust Stack Demo: FAQs</h1>
      <div class="card">
        <div class="muted">Default demo credentials</div>
        <ul>
          <li>OpenObserve: <code>${process.env.OO_ROOT_USER_EMAIL || 'env-missing'}</code> / <code>${process.env.OO_ROOT_USER_PASSWORD || 'env-missing'}</code></li>
          <li>FIR: <code>${process.env.FIR_ADMIN_EMAIL || 'admin@local'}</code> / <code>${process.env.FIR_ADMIN_PASSWORD || 'env-missing'}</code></li>
          <li>Grafana: <code>${process.env.GRAFANA_ADMIN_USER || 'admin'}</code> / <code>${process.env.GRAFANA_ADMIN_PASSWORD || 'env-missing'}</code></li>
          <li>ERPNext: <code>${process.env.ERP_BOOTSTRAP_ADMIN_USER || 'Administrator'}</code> / <code>${process.env.ERP_BOOTSTRAP_ADMIN_PASSWORD || 'env-missing'}</code> <span class="muted">(email alias: <code>${process.env.ERP_BOOTSTRAP_ADMIN_EMAIL || 'admin@example.com'}</code>; direct-bind: <code>http://localhost:${process.env.ERP_MES_HOST_PORT || '3036'}</code>; site: <code>${process.env.ERP_SITE_NAME || 'localhost'}</code>)</span></li>
        </ul>
        <div class="muted">Change every one of these before any shared use.</div>
      </div>
    </div>
  </body>
  </html>`;
  res.status(200).send(html);
});

faq.listen(faqInternalPort, () => {
  // eslint-disable-next-line no-console
  console.log(`FAQs listening on ${faqInternalPort}`);
});

// FAQs favicon: simple purple F
faq.get('/favicon.svg', (_req, res) => {
  const brand = '#8000ff';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect x="0" y="0" width="64" height="64" rx="12" fill="#ffffff"/>
  <rect x="16" y="10" width="8" height="44" rx="2" fill="${brand}"/>
  <rect x="24" y="10" width="24" height="8" rx="2" fill="${brand}"/>
  <rect x="24" y="26" width="18" height="8" rx="2" fill="${brand}"/>
</svg>`;
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('image/svg+xml').status(200).send(svg);
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Landing listening on ${port}`);
});
