import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// Config
const port = parseInt(process.env.ERP_BRIDGE_PORT || '3037', 10);
const version = '0.1.0';
const pollMs = parseInt(process.env.ERP_BRIDGE_POLL_MS || '15000', 10);

// ERP (ERPNext) API
const erpApiUrl = (process.env.ERP_API_URL || '').replace(/\/+$/, '');
const erpApiKey = process.env.ERP_API_KEY || '';
const erpApiSecret = process.env.ERP_API_SECRET || '';
const erpApiHostHeader = process.env.ERP_API_HOST_HEADER || ''; // e.g., site.local

// OpenObserve (OO)
const ooBaseUrl = (process.env.OO_URL || 'http://openobserve:5080').replace(/\/+$/, '');
const ooUser = process.env.OO_USER || process.env.ZO_ROOT_USER_EMAIL || 'admin@example.com';
const ooPass = process.env.OO_PASS || process.env.ZO_ROOT_USER_PASSWORD;
const ooIngestUrl = `${ooBaseUrl}/api/default/erp_bridge/_json`;

// FIR
const firUrl = (process.env.FIR_INTERNAL_URL || process.env.FIR_URL || 'http://fir:3006').replace(/\/+$/, '');
const firServiceToken = process.env.FIR_SERVICE_TOKEN || '';

// State
let timer = null;
let lastQuerySinceTs = 0; // ms epoch for "updated in last minute" fallback
const seenHashes = new Map(); // hash -> firstSeenMs, prunes after 24h
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

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

function toUtcIso(ts) {
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  if (typeof ts === 'number') {
    const d = new Date(ts);
    return d.toISOString();
  }
  return new Date().toISOString();
}

async function erpReachable() {
  if (!erpApiUrl) return true; // ready when ERP is not configured
  try {
    const { signal, cancel } = timeoutSignal(2500);
    const r = await fetch(`${erpApiUrl}/api/method/ping`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(erpApiHostHeader ? { 'Host': erpApiHostHeader, 'X-Frappe-Site-Name': erpApiHostHeader } : {}),
      },
      signal,
    });
    cancel();
    if (!r.ok) return false;
    const j = await r.json().catch(() => ({}));
    return j && j.message === 'pong';
  } catch (_e) {
    return false;
  }
}

async function queryUpdatedWorkOrders(sinceMs) {
  // If ERP is not configured, return empty list
  if (!erpApiUrl) return [];
  try {
    // Query last minute by default to bound results; also track moving "since"
    const sinceIso = new Date(Math.max(Date.now() - 60_000, sinceMs || 0)).toISOString();
    const params = new URLSearchParams();
    params.set('fields', JSON.stringify(['name', 'status', 'modified']));
    params.set('filters', JSON.stringify([['modified', '>=', sinceIso]]));
    params.set('order_by', 'modified desc');
    params.set('limit_page_length', '100');
    const url = `${erpApiUrl}/api/resource/Work Order?${params.toString()}`;
    const { signal, cancel } = timeoutSignal(5000);
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(erpApiKey && erpApiSecret ? { 'Authorization': `token ${erpApiKey}:${erpApiSecret}` } : {}),
        ...(erpApiHostHeader ? { 'Host': erpApiHostHeader, 'X-Frappe-Site-Name': erpApiHostHeader } : {}),
      },
      signal,
    });
    cancel();
    if (!r.ok) return [];
    const j = await r.json().catch(() => ({}));
    // Frappe returns { data: [ ... ] }
    const rows = Array.isArray(j?.data) ? j.data : [];
    return rows.map((row) => ({
      work_order_id: row.name,
      status: row.status,
      status_ts: toUtcIso(row.modified),
    }));
  } catch (_e) {
    return [];
  }
}

function hashKey(workOrderId, status, statusTs) {
  const h = crypto.createHash('sha256');
  h.update(String(workOrderId || ''));
  h.update('|');
  h.update(String(status || ''));
  h.update('|');
  h.update(String(statusTs || ''));
  return h.digest('hex');
}

function pruneDedupe(now) {
  for (const [k, firstSeen] of seenHashes.entries()) {
    if (now - firstSeen > DEDUPE_WINDOW_MS) {
      seenHashes.delete(k);
    }
  }
}

async function postToOO(event) {
  try {
    const payload = [{
      ...event,
      stack_profile: 'mes',
      component: 'erp-bridge',
      source: 'erp-bridge',
      timestamp: event.timestamp || Date.now(),
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

async function createFirCase(title, description) {
  if (!firServiceToken) return false;
  try {
    const { signal, cancel } = timeoutSignal(3000);
    const r = await fetch(`${firUrl}/api/cases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': firServiceToken,
      },
      body: JSON.stringify({ title, description }),
      signal,
    });
    cancel();
    return r.ok;
  } catch (_e) {
    return false;
  }
}

async function handleWorkOrderChange(change) {
  const now = Date.now();
  const key = hashKey(change.work_order_id, change.status, change.status_ts);
  pruneDedupe(now);
  if (seenHashes.has(key)) {
    return { skipped: 'duplicate' };
  }

  // Enforce cooldown and rate limit
  if (withinCooldownWindow(now)) {
    const retryAfterMs = Math.max(0, cooldownUntil - now);
    return { skipped: 'cooldown', retry_after_ms: retryAfterMs };
  }
  if (now - lastEmitTs < MIN_INTERVAL_MS) {
    return { skipped: 'rate_limited' };
  }

  const event = {
    work_order_id: change.work_order_id,
    status: change.status,
    status_ts: change.status_ts,
    status_ts_utc: change.status_ts, // explicit
  };
  const ok = await postToOO(event);
  if (!ok) {
    return { error: 'oo_ingest_failed' };
  }

  // Update windows after successful post
  lastEmitTs = now;
  windowEvents.push(now);
  seenHashes.set(key, now);

  // On QC_FAIL, create a FIR case (best-effort)
  if (String(change.status).toUpperCase() === 'QC_FAIL') {
    const title = `QC_FAIL for Work Order ${change.work_order_id}`;
    const description = `Status changed to QC_FAIL at ${change.status_ts}Z (UTC).`;
    await createFirCase(title, description);
  }
  return { ok: true };
}

async function pollOnce() {
  const since = lastQuerySinceTs || (Date.now() - 60_000);
  const changes = await queryUpdatedWorkOrders(since);
  // Update last query point to the newest status_ts we saw (or now)
  let maxTs = since;
  for (const ch of changes) {
    const t = Date.parse(ch.status_ts) || 0;
    if (t > maxTs) maxTs = t;
  }
  lastQuerySinceTs = Math.max(maxTs, since);
  // Process in reverse chronological (oldest first) to preserve ordering
  for (const ch of [...changes].reverse()) {
    await handleWorkOrderChange(ch);
  }
}

function startPolling() {
  if (timer) return;
  timer = setInterval(pollOnce, Math.max(3000, pollMs));
}

function stopPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Endpoints
app.get('/healthz', (_req, res) => {
  const now = Date.now();
  const cooldownRemainingMs = Math.max(0, cooldownUntil - now);
  res.status(200).json({
    status: 'ok',
    version,
    poll_ms: pollMs,
    cooldown_remaining_ms: cooldownRemainingMs,
  });
});

app.get('/readyz', async (_req, res) => {
  const ok = await erpReachable();
  res.status(ok ? 200 : 503).json({ ok, erpApiUrl: erpApiUrl ? 'set' : 'unset' });
});

app.get('/', (_req, res) => {
  const html = `<!doctype html>
  <html lang="en"><head><meta charset="utf-8"/>
  <title>ERP Bridge</title>
  <style>body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;padding:22px}
  .muted{color:#64748b}</style></head>
  <body>
    <h2>ERP Bridge</h2>
    <div class="muted">version: <strong>${version}</strong> · poll: <strong>${pollMs}ms</strong></div>
    <ul>
      <li><a href="/healthz">/healthz</a></li>
      <li><a href="/readyz">/readyz</a></li>
    </ul>
    <div class="muted">Polls ERPNext Work Orders updated in the last minute. Emits to OpenObserve and opens a FIR case on QC_FAIL. Deduped by sha256(work_order_id + status + ts), ≤1/sec, cooldown 60s if >10/min.</div>
  </body></html>`;
  res.status(200).send(html);
});

// Lifecycle
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`ERP bridge listening on ${port}, polling every ${pollMs}ms`);
  setTimeout(() => {
    try { startPolling(); } catch (_e) {}
  }, 10_000);
});


