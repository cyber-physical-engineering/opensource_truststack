import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import pkg from 'pg';

const app = express();

// Config
const port = parseInt(process.env.SIM_PORT || '3010', 10);
const emitPeriodMs = parseInt(process.env.SIM_PERIOD_MS || '1000', 10);
const seriesName = process.env.SIM_SERIES || 'baseline';
const enableOO = String(process.env.ENABLE_OO || '0') === '1';
const seedHistory = String(process.env.SEED_HISTORY || '1') === '1';
const autoStart = String(process.env.SIM_AUTO_START || '0') === '1';
const ooStream = process.env.OO_STREAM || 'simulator';
const ooIngestUrl = process.env.OO_INGEST_URL || `http://openobserve:5080/api/default/${ooStream}/_json`;
const ooUser = process.env.OO_USER || process.env.ZO_ROOT_USER_EMAIL || 'admin@example.com';
const ooPass = process.env.OO_PASS || process.env.ZO_ROOT_USER_PASSWORD;
const pgPassword = process.env.PGPASSWORD;
const pgDatabase = process.env.PGDATABASE || 'truststack';
const pgPort = parseInt(process.env.PGPORT || '5432', 10);
const { Pool } = pkg;
const pgPool = new Pool({ host: pgHost, user: pgUser, password: pgPassword, database: pgDatabase, port: pgPort, max: 3, idleTimeoutMillis: 5000, connectionTimeoutMillis: 3000 });

let tickCount = 0;
let sentCount = 0;
let lastValue = 0;
let lastError = '';
let seeded = false;
let running = false;
let intervalHandle = null;

function deterministicValue(t) {
  // Simple repeating sawtooth 0..99
  return t % 100;
}

async function maybePostToOO(event) {
  if (!enableOO) return;
  let delay = 500;
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await fetch(ooIngestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from(`${ooUser}:${ooPass}`).toString('base64'),
        },
        body: JSON.stringify([event]),
      });
      if (resp.ok) return;
      lastError = `OO ingest ${resp.status}`;
    } catch (err) {
      lastError = (err && err.message) || String(err);
    }
    await new Promise(res => setTimeout(res, delay));
    delay = Math.min(Math.floor(delay * 1.5), 3000);
  }
}

async function postBatchToOO(batch, attempts = 3) {
  if (!enableOO || !Array.isArray(batch) || batch.length === 0) return true;
  let delay = 500;
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(ooIngestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from(`${ooUser}:${ooPass}`).toString('base64'),
        },
        body: JSON.stringify(batch),
      });
      if (resp.ok) return true;
      lastError = `OO batch ingest ${resp.status}`;
    } catch (err) {
      lastError = (err && err.message) || String(err);
    }
    await new Promise(res => setTimeout(res, delay));
    delay = Math.min(Math.floor(delay * 1.5), 3000);
  }
  return false;
}

async function waitForOOReady({ maxWaitMs = 90000 } = {}) {
  try {
    const origin = new URL(ooIngestUrl).origin;
    const start = Date.now();
    let delay = 500;
    while (Date.now() - start < maxWaitMs) {
      try {
        const r = await fetch(origin + '/', { method: 'GET' });
        if (r.ok) return true;
      } catch (_) {}
      await new Promise(res => setTimeout(res, delay));
      delay = Math.min(Math.floor(delay * 1.5), 3000);
    }
  } catch (_) {}
  return false;
}

async function seedHistoricalDataIfNeeded() {
  if (!enableOO || !seedHistory) return;
  try {
    const ready = await waitForOOReady({ maxWaitMs: 90000 });
    if (!ready) {
      lastError = 'OpenObserve not ready in time for seed';
      return;
    }
    const markerPath = path.join('/app', '.seeded');
    try {
      await fs.access(markerPath);
      seeded = true;
      return; // already seeded
    } catch (_err) {
      // proceed to seed
    }

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const startTs = now - oneDayMs;

    // Use 60s resolution for fast seed (1440 points)
    const stepMs = 60 * 1000;
    const events = [];
    let localTick = 0;
    for (let ts = startTs; ts <= now; ts += stepMs) {
      const val = deterministicValue(localTick++);
      events.push({ timestamp: ts, series: seriesName, value: val, tick: localTick });
    }

    // Send in batches
    const batchSize = 500;
    let failures = 0;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      const ok = await postBatchToOO(batch);
      if (!ok) failures++;
    }
    if (failures === 0) {
      await fs.writeFile(markerPath, new Date().toISOString(), 'utf8');
      seeded = true;
    }
  } catch (err) {
    lastError = (err && err.message) || String(err);
  }
}

async function initSimState() {
  // Create table and load last_tick for this series
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS sim_state (
      series TEXT PRIMARY KEY,
      last_tick INT NOT NULL,
      config JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const res = await pgPool.query('SELECT last_tick FROM sim_state WHERE series = $1', [seriesName]);
  if (res.rowCount > 0) {
    const v = parseInt(res.rows[0].last_tick, 10);
    if (!Number.isNaN(v) && v >= 0) {
      tickCount = v;
    }
  }
}

async function persistSimState(currentTick) {
  const cfg = { series: seriesName, periodMs: emitPeriodMs, enableOO, ooStream };
  await pgPool.query(
    'INSERT INTO sim_state (series, last_tick, config, updated_at) VALUES ($1, $2, $3, now()) ON CONFLICT (series) DO UPDATE SET last_tick = EXCLUDED.last_tick, config = EXCLUDED.config, updated_at = now()',
    [seriesName, currentTick, cfg]
  );
}

function startEmitter() {
  if (intervalHandle) return;
  intervalHandle = setInterval(async () => {
    if (!running) return;
    const ts = Date.now();
    const val = deterministicValue(tickCount++);
    lastValue = val;
    const event = {
      timestamp: ts,
      series: seriesName,
      value: val,
      tick: tickCount,
    };
    // Log locally for demo visibility
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(event));
    await maybePostToOO(event);
    sentCount++;
    // best-effort persistence; ignore errors to not affect emission
    try { await persistSimState(tickCount); } catch (_e) {}
  }, emitPeriodMs);
}

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, running, ticks: tickCount, sent: sentCount, lastValue, enableOO, seeded, lastError });
});

app.post('/start', (_req, res) => {
  running = true;
  startEmitter();
  res.status(200).json({ ok: true, running });
});

app.post('/stop', (_req, res) => {
  running = false;
  res.status(200).json({ ok: true, running });
});

app.post('/reset_state', async (_req, res) => {
  try {
    await pgPool.query('DELETE FROM sim_state WHERE series = $1', [seriesName]);
    tickCount = 0;
    res.status(200).json({ ok: true, reset: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Simulator listening on ${port}`);
  // Run historical seed in the background on first boot
  // to ensure OO has immediate history for demos
  seedHistoricalDataIfNeeded().then(() => {
    // eslint-disable-next-line no-console
    if (seeded) console.log('Historical seed completed or already present');
  });
  // Initialize sim_state and adopt last_tick
  initSimState().catch(() => {});
  startEmitter();
  if (autoStart) running = true;
});


