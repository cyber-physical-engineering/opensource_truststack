import express from 'express';

const app = express();
app.use(express.json());

// Config
const port = parseInt(process.env.ANOMALY_PORT || '3011', 10);
const simulatorUrl = process.env.SIMULATOR_INTERNAL_URL || 'http://simulator:3010';
let zThreshold = (() => {
  const n = parseFloat(process.env.Z_THRESHOLD || '1.5');
  return Number.isFinite(n) ? n : 1.5;
})();
const emaAlpha = Math.max(0.01, Math.min(0.99, parseFloat(process.env.EMA_ALPHA || '0.2')));

// OpenObserve ingest (optional)
const enableOO = String(process.env.ENABLE_OO || '1') === '1';
const ooIngestUrl = process.env.OO_INGEST_URL || 'http://openobserve:5080/api/default/anomaly/_json';
const ooUser = process.env.OO_USER || process.env.ZO_ROOT_USER_EMAIL || 'admin@example.com';
const ooPass = process.env.OO_PASS || process.env.ZO_ROOT_USER_PASSWORD;

// FIR case creation (optional)
const firUrl = process.env.FIR_INTERNAL_URL || 'http://fir:3006';
const firServiceToken = process.env.FIR_SERVICE_TOKEN || '';
const adminToken = process.env.ANOMALY_ADMIN_TOKEN || '';

// State
let ema = 0;
let variance = 0; // approximate rolling variance
let count = 0;
let anomalyCount = 0;
let lastAnomalyTs = 0;
let lastError = '';
let cooldownUntil = 0;
let windowEvents = []; // timestamps within last 60s for burst detection

// Rate limiting: max 1 anomaly emission every 2s
const MIN_EMIT_INTERVAL_MS = 2000;
// Cooldown: if >10 anomalies in a rolling minute, pause POSTs for 60s
const MAX_PER_MINUTE = 10;
const COOLDOWN_MS = 60_000;

async function fetchSimulator() {
  try {
    const r = await fetch(`${simulatorUrl}/healthz`, { method: 'GET' });
    if (!r.ok) throw new Error(`/healthz ${r.status}`);
    const j = await r.json();
    if (typeof j.lastValue !== 'number') throw new Error('missing lastValue');
    return { ok: true, value: j.lastValue, ticks: j.ticks ?? 0 };
  } catch (e) {
    lastError = String(e && e.message ? e.message : e);
    return { ok: false };
  }
}

function updateStats(x) {
  // Exponential moving average and a simple rolling variance estimate
  if (count === 0) {
    ema = x;
    variance = 0;
    count = 1;
    return;
  }
  const prevEma = ema;
  ema = ema * (1 - emaAlpha) + x * emaAlpha;
  // Update variance with exponentially weighted approach
  const diff = x - prevEma;
  variance = (1 - emaAlpha) * (variance + emaAlpha * diff * diff);
  count++;
}

function currentStddev() {
  return Math.sqrt(Math.max(variance, 1e-9));
}

function withinCooldownWindow(now) {
  // window-based cooldown for bursts
  const oneMinuteAgo = now - 60_000;
  windowEvents = windowEvents.filter((ts) => ts >= oneMinuteAgo);
  if (windowEvents.length > MAX_PER_MINUTE) {
    cooldownUntil = now + COOLDOWN_MS;
  }
  return now < cooldownUntil;
}

async function postToOO(event) {
  if (!enableOO) return true;
  try {
    const resp = await fetch(ooIngestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${ooUser}:${ooPass}`).toString('base64'),
      },
      body: JSON.stringify([event]),
    });
    if (!resp.ok) {
      lastError = `OO ingest ${resp.status}`;
      return false;
    }
    return true;
  } catch (e) {
    lastError = String(e && e.message ? e.message : e);
    return false;
  }
}

async function postCaseToFIR(title, description) {
  if (!firServiceToken) return true; // disabled unless token provided
  try {
    const resp = await fetch(`${firUrl}/api/cases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': firServiceToken,
      },
      body: JSON.stringify({ title, description }),
    });
    if (!resp.ok) {
      lastError = `FIR case ${resp.status}`;
      return false;
    }
    return true;
  } catch (e) {
    lastError = String(e && e.message ? e.message : e);
    return false;
  }
}

async function loop() {
  const res = await fetchSimulator();
  if (!res.ok) return;
  const x = res.value;
  updateStats(x);
  const std = currentStddev();
  const z = std > 0 ? Math.abs((x - ema) / std) : 0;

  const now = Date.now();
  const timeSinceLast = now - lastAnomalyTs;
  const inCooldown = withinCooldownWindow(now) || timeSinceLast < MIN_EMIT_INTERVAL_MS;

  if (z >= zThreshold && !inCooldown) {
    const event = {
      timestamp: now,
      series: 'baseline',
      value: x,
      ema,
      std,
      z,
      type: 'anomaly',
    };
    const okOO = await postToOO(event);
    const okFIR = await postCaseToFIR('Anomaly detected (z-score)', `z=${z.toFixed(2)} value=${x} ema=${ema.toFixed(2)} std=${std.toFixed(2)}`);
    if (okOO || okFIR) {
      anomalyCount++;
      lastAnomalyTs = now;
      windowEvents.push(now);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ msg: 'anomaly', z, x, ema, std }));
    }
  }
}

setInterval(loop, 1000);

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/config', (_req, res) => {
  res.status(200).json({ ok: true, zThreshold, emaAlpha });
});

app.post('/config', async (req, res) => {
  try {
    const t = req.header('X-Admin-Token') || '';
    if (!adminToken || t !== adminToken) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const body = await (async () => {
      try { return req.body || {}; } catch { return {}; }
    })();
    const next = parseFloat(body.zThreshold ?? body.z_threshold);
    if (!Number.isFinite(next) || next <= 0 || next > 10) {
      return res.status(400).json({ ok: false, error: 'invalid threshold' });
    }
    zThreshold = next;
    return res.status(200).json({ ok: true, zThreshold });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get('/metrics', (_req, res) => {
  const lines = [];
  lines.push('# HELP anomaly_count Total anomalies emitted');
  lines.push('# TYPE anomaly_count counter');
  lines.push(`anomaly_count ${anomalyCount}`);
  lines.push('# HELP last_anomaly_ts_seconds Timestamp of last anomaly (seconds)');
  lines.push('# TYPE last_anomaly_ts_seconds gauge');
  if (lastAnomalyTs) {
    lines.push(`last_anomaly_ts_seconds ${Math.floor(lastAnomalyTs / 1000)}`);
  }
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.status(200).send(lines.join('\n') + '\n');
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Anomaly listening on ${port}`);
});


