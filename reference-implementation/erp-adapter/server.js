import express from 'express';

const app = express();
app.use(express.json());

// Config
const port = parseInt(process.env.ERP_ADAPTER_PORT || '3034', 10);
const version = '0.1.0';
const erpUrl = process.env.ERP_URL || '';
const demoEnabled = String(process.env.ERP_DEMO_ENABLED || '1') === '1';
const ooBaseUrl = process.env.OO_URL || 'http://openobserve:5080';
const ooUser = process.env.OO_USER || process.env.ZO_ROOT_USER_EMAIL || 'admin@example.com';
const ooPass = process.env.OO_PASS || process.env.ZO_ROOT_USER_PASSWORD;

// Derived
const mode = erpUrl ? 'real' : (demoEnabled ? 'simulated' : 'disabled');
const ooIngestUrl = `${ooBaseUrl.replace(/\/$/, '')}/api/default/erp_adapter/_json`;

// Rate limiting and cooldown
let lastEmitTs = 0;
let windowEvents = []; // timestamps of last minute
const MIN_INTERVAL_MS = 1000; // ≤1/sec
const MAX_PER_MINUTE = 10;
const COOLDOWN_MS = 60_000; // 60s pause
let cooldownUntil = 0;

function withinCooldownWindow(now) {
  const oneMinuteAgo = now - 60_000;
  windowEvents = windowEvents.filter((ts) => ts >= oneMinuteAgo);
  if (windowEvents.length > MAX_PER_MINUTE) {
    cooldownUntil = now + COOLDOWN_MS;
  }
  return now < cooldownUntil;
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(id) };
}

async function erpReachable() {
  if (!erpUrl) return true; // ready when ERP is not configured (per spec)
  try {
    const { signal, cancel } = timeoutSignal(2000);
    const r = await fetch(erpUrl, { method: 'GET', signal });
    cancel();
    return r.ok;
  } catch (_e) {
    return false;
  }
}

async function postToOO(event) {
  try {
    const payload = [{
      ...event,
      stack_profile: 'mes',
      component: 'erp-adapter',
      // prefer consistent timestamp field name
      timestamp: event.timestamp || Date.now()
    }];
    const resp = await fetch(ooIngestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${ooUser}:${ooPass}`).toString('base64'),
      },
      body: JSON.stringify(payload),
    });
    return resp.ok;
  } catch (_e) {
    return false;
  }
}

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', version, mode });
});

app.get('/readyz', async (_req, res) => {
  const ok = await erpReachable();
  res.status(ok ? 200 : 503).json({ ok, erpUrl: erpUrl ? 'set' : 'unset' });
});

app.get('/', (_req, res) => {
  const html = `<!doctype html>
  <html lang="en"><head><meta charset="utf-8"/>
  <title>ERP Adapter</title>
  <style>body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;padding:22px}
  .muted{color:#64748b}</style></head>
  <body>
    <h2>ERP Adapter</h2>
    <div class="muted">mode: <strong>${mode}</strong> · version: <strong>${version}</strong></div>
    <ul>
      <li><a href="/healthz">/healthz</a></li>
      <li><a href="/readyz">/readyz</a></li>
    </ul>
    <div class="muted">POST <code>/erp/event</code> mirrors events to OpenObserve with ≤1/sec and 60s cooldown if >10/min.</div>
  </body></html>`;
  res.status(200).send(html);
});

app.post('/erp/event', async (req, res) => {
  try {
    const body = req.body || {};
    const now = Date.now();
    // Enforce cooldown and rate limit
    if (withinCooldownWindow(now)) {
      return res.status(429).json({ ok: false, error: 'cooldown', retry_after_ms: Math.max(0, cooldownUntil - now) });
    }
    if (now - lastEmitTs < MIN_INTERVAL_MS) {
      return res.status(429).json({ ok: false, error: 'rate_limited' });
    }

    // Minimal shape: pass through with tags
    const event = {
      ...body,
      timestamp: body.timestamp || now,
      source: 'erp-adapter'
    };

    const ok = await postToOO(event);
    if (!ok) {
      return res.status(502).json({ ok: false, error: 'oo_ingest_failed' });
    }

    // Update windows after successful post
    lastEmitTs = now;
    windowEvents.push(now);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`ERP adapter listening on ${port}`);
});


