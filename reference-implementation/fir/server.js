import express from 'express';
import pkg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const port = parseInt(process.env.FIR_PORT || '3006', 10);
const anomalyInternalUrl = process.env.ANOMALY_INTERNAL_URL || 'http://anomaly:3011';
const anomalyPublicUrl = process.env.ANOMALY_PUBLIC_URL || 'http://localhost:3035';
const anomalyAdminToken = process.env.ANOMALY_ADMIN_TOKEN || '';

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: parseInt(process.env.PGPORT || '5432', 10),
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
});

async function runMigrationsAndSeed() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fir_users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fir_cases (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INTEGER REFERENCES fir_users(id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fir_case_notes (
      id SERIAL PRIMARY KEY,
      case_id INTEGER NOT NULL REFERENCES fir_cases(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INTEGER REFERENCES fir_users(id),
      UNIQUE (case_id, hash)
    );
  `);

  const adminEmail = process.env.FIR_ADMIN_EMAIL;
  const adminPassword = process.env.FIR_ADMIN_PASSWORD;

  const existing = await pool.query('SELECT id FROM fir_users WHERE email = $1', [adminEmail]);
  if (existing.rowCount === 0) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await pool.query('INSERT INTO fir_users (email, password_hash) VALUES ($1, $2)', [adminEmail, passwordHash]);
  }

  // Guarded demo case seed (first-boot only): insert when no cases exist
  const adminRow = await pool.query('SELECT id FROM fir_users WHERE email = $1', [adminEmail]);
  const adminId = adminRow.rows[0]?.id || null;
  const caseCount = await pool.query('SELECT COUNT(1) AS n FROM fir_cases');
  const n = parseInt(caseCount.rows[0]?.n || '0', 10);
  if (n === 0 && adminId) {
    const now = Date.now();
    function daysAgo(d) { return new Date(now - d * 24 * 60 * 60 * 1000); }
    const demoCases = [
      { title: 'Unauthorized access attempt detected', desc: 'Multiple failed logins from external IP block. Review access logs and block offending network range.', status: 'open', ts: daysAgo(1) },
      { title: 'OT sensor anomaly flagged', desc: 'Baseline deviation observed on pressure sensor A3. Cross-check simulator events and trend lines.', status: 'investigating', ts: daysAgo(2) },
      { title: 'Phishing reported by user', desc: 'Employee forwarded suspicious email to security mailbox. Headers indicate spoofed domain.', status: 'open', ts: daysAgo(4) },
      { title: 'Firewall policy misconfiguration', desc: 'Excessive allow rules found during routine review. Tighten to least privilege.', status: 'closed', ts: daysAgo(7) },
      { title: 'Malformed netflow spikes', desc: 'Short burst of high-entropy flows on segment OT-02. Validate against maintenance window.', status: 'investigating', ts: daysAgo(3) },
    ];
    for (const c of demoCases) {
      await pool.query(
        'INSERT INTO fir_cases (title, description, status, created_at, created_by) VALUES ($1, $2, $3, $4, $5)',
        [c.title, c.desc, c.status, c.ts.toISOString(), adminId]
      );
    }
  }
}

async function checkDb() {
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

// naive in-memory session map for demo purposes
const tokenToUserId = new Map();

function requireAuth(req, res, next) {
  const token = req.headers['x-demo-token'] || req.query.token || req.cookies?.demo_token;
  const userId = token ? tokenToUserId.get(String(token)) : undefined;
  if (!userId) {
    return res.redirect('/login');
  }
  req.userId = userId;
  return next();
}

app.get('/healthz', async (_req, res) => {
  const db = await checkDb();
  const ok = db.ok === true;
  res.status(ok ? 200 : 503).json({ ok, db });
});

// Minimal service-authenticated JSON API for case creation
app.post('/api/cases', async (req, res) => {
  try {
    const token = req.header('X-Service-Token') || '';
    const expected = process.env.FIR_SERVICE_TOKEN;
    if (!expected || token !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const { title, description } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ ok: false, error: 'missing title' });
    }
    // Attribute to admin for demo purposes
    const adminEmail = process.env.FIR_ADMIN_EMAIL;
    const adminRow = await pool.query('SELECT id FROM fir_users WHERE email = $1', [adminEmail]);
    const adminId = adminRow.rows[0]?.id || null;
    const r = await pool.query('INSERT INTO fir_cases (title, description, created_by) VALUES ($1, $2, $3) RETURNING id', [title, description || null, adminId]);
    return res.status(200).json({ ok: true, id: r.rows[0].id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// Service-auth: add a note to a case; idempotent by (case_id, hash)
app.post('/api/cases/:id/notes', async (req, res) => {
  try {
    const token = req.header('X-Service-Token') || '';
    const expected = process.env.FIR_SERVICE_TOKEN;
    if (!expected || token !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const caseId = parseInt(req.params.id, 10);
    if (!Number.isFinite(caseId)) {
      return res.status(400).json({ ok: false, error: 'bad case id' });
    }
    const { body, hash } = req.body || {};
    if (!body || typeof body !== 'string') {
      return res.status(400).json({ ok: false, error: 'missing body' });
    }
    const adminEmail = process.env.FIR_ADMIN_EMAIL;
    const adminRow = await pool.query('SELECT id FROM fir_users WHERE email = $1', [adminEmail]);
    const createdBy = adminRow.rows[0]?.id || null;
    const r = await pool.query(
      'INSERT INTO fir_case_notes (case_id, body, hash, created_by) VALUES ($1, $2, $3, $4) ON CONFLICT (case_id, hash) DO NOTHING RETURNING id',
      [caseId, body, hash || null, createdBy]
    );
    const dedup = r.rowCount === 0;
    return res.status(200).json({ ok: true, dedup, id: r.rows[0]?.id || null });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// Service-auth: list notes for a case (for smoke tests)
app.get('/api/cases/:id/notes', async (req, res) => {
  try {
    const token = req.header('X-Service-Token') || '';
    const expected = process.env.FIR_SERVICE_TOKEN;
    if (!expected || token !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const caseId = parseInt(req.params.id, 10);
    if (!Number.isFinite(caseId)) {
      return res.status(400).json({ ok: false, error: 'bad case id' });
    }
    const rows = await pool.query(
      'SELECT id, body, hash, created_at FROM fir_case_notes WHERE case_id = $1 ORDER BY id DESC LIMIT 100',
      [caseId]
    );
    return res.status(200).json({ ok: true, notes: rows.rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

function timeoutSignal(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(id) };
}

async function pingAnomaly() {
  try {
    const { signal, cancel } = timeoutSignal(1500);
    const r = await fetch(`${anomalyInternalUrl}/healthz`, { signal });
    cancel();
    return { ok: r.ok === true };
  } catch (_e) {
    return { ok: false };
  }
}

async function getAnomalyConfig() {
  try {
    const { signal, cancel } = timeoutSignal(1500);
    const r = await fetch(`${anomalyInternalUrl}/config`, { signal });
    cancel();
    if (!r.ok) return null;
    return await r.json();
  } catch (_e) {
    return null;
  }
}

async function setAnomalyThreshold(threshold) {
  try {
    const r = await fetch(`${anomalyInternalUrl}/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': anomalyAdminToken || '',
      },
      body: JSON.stringify({ zThreshold: threshold }),
    });
    if (!r.ok) return { ok: false, status: r.status };
    return await r.json();
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

app.get('/', (_req, res) => res.redirect('/login'));

app.get('/login', async (_req, res) => {
  const anomaly = await pingAnomaly();
  const aok = !!anomaly.ok;
  const cfg = await getAnomalyConfig();
  const z = cfg && typeof cfg.zThreshold === 'number' ? cfg.zThreshold : null;
  const html = `<!doctype html>
  <html><head><meta charset="utf-8"><title>FIR Login</title>
  <style>body{font-family:system-ui;padding:24px;color:#0f172a} .card{max-width:480px;border:1px solid #e5e7eb;border-radius:12px;padding:20px;}
  input,textarea{width:100%;padding:8px;margin:8px 0;border:1px solid #e5e7eb;border-radius:8px} button{background:#2563eb;color:#fff;border:none;padding:10px 14px;border-radius:8px;cursor:pointer}
  .muted{color:#6b7280;font-size:14px}
  </style></head><body>
  <div class="card">
    <h2>FIR — Sign in</h2>
    <div class="muted" style="margin:6px 0;">
      Anomaly: <span style="color:${aok ? '#16a34a' : '#dc2626'};">${aok ? 'healthy' : 'unhealthy'}</span>
      &nbsp;·&nbsp;
      <a href="${anomalyPublicUrl}/metrics" target="_blank" rel="noopener">metrics</a>
      ${z!=null ? `&nbsp;·&nbsp;<span>z-threshold=${z}</span>` : ''}
    </div>
    <form method="post" action="/login">
      <label>Email</label>
      <input type="email" name="email" required />
      <label>Password</label>
      <input type="password" name="password" required />
      <button type="submit">Sign in</button>
      <div class="muted" style="margin-top:8px;">Default admin from env: <code>${process.env.FIR_ADMIN_EMAIL || 'env-missing'}</code></div>
    </form>
  </div>
  </body></html>`;
  res.status(200).send(html);
});

app.post('/login', express.urlencoded({ extended: true }), async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).send('Missing credentials');
  const result = await pool.query('SELECT id, password_hash FROM fir_users WHERE email=$1', [email]);
  if (result.rowCount === 0) return res.status(401).send('Invalid credentials');
  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).send('Invalid credentials');
  const token = Math.random().toString(36).slice(2);
  tokenToUserId.set(token, user.id);
  res.redirect(`/cases?token=${token}`);
});

app.get('/cases', async (req, res) => {
  const token = req.query.token;
  const userId = token ? tokenToUserId.get(String(token)) : undefined;
  if (!userId) return res.redirect('/login');
  const anomaly = await pingAnomaly();
  const aok = !!anomaly.ok;
  const cfg = await getAnomalyConfig();
  const z = cfg && typeof cfg.zThreshold === 'number' ? cfg.zThreshold : null;
  const cases = await pool.query('SELECT id, title, description, status, created_at FROM fir_cases ORDER BY id DESC LIMIT 200');
  const html = `<!doctype html>
  <html><head><meta charset="utf-8"><title>FIR Cases</title>
  <style>body{font-family:system-ui;padding:24px;color:#0f172a}
  .row{display:flex;gap:8px;align-items:baseline;border-bottom:1px dashed #e5e7eb;padding:8px 0}
  .card{max-width:800px;margin-bottom:16px}
  input,textarea{width:100%;padding:8px;margin:8px 0;border:1px solid #e5e7eb;border-radius:8px}
  button{background:#16a34a;color:#fff;border:none;padding:10px 14px;border-radius:8px;cursor:pointer}
  table{border-collapse:collapse;width:100%} th,td{border:1px solid #e5e7eb;padding:8px;text-align:left}
  </style></head><body>
  <div class="card">
    <h2>FIR — Cases</h2>
    <div class="muted" style="margin:6px 0;">
      Anomaly: <span style="color:${aok ? '#16a34a' : '#dc2626'};">${aok ? 'healthy' : 'unhealthy'}</span>
      &nbsp;·&nbsp;
      <a href="${anomalyPublicUrl}/metrics" target="_blank" rel="noopener">metrics</a>
      ${z!=null ? `&nbsp;·&nbsp;<span>z-threshold=${z}</span>` : ''}
    </div>
    <form method="post" action="/anomaly/threshold?token=${token}">
      <label>Set z-threshold</label>
      <input type="number" step="0.1" min="0.1" max="10" name="z_threshold" value="${z!=null ? z : 1.5}" />
      <button type="submit">Update</button>
      <span class="muted">(applies immediately)</span>
    </form>
    <form method="post" action="/cases?token=${token}">
      <label>Title</label>
      <input name="title" required />
      <label>Description</label>
      <textarea name="description" rows="3"></textarea>
      <button type="submit">Create Case</button>
    </form>
  </div>
  <table><thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Created</th></tr></thead>
  <tbody>
  ${cases.rows.map(c => `<tr><td>${c.id}</td><td>${escapeHtml(c.title)}</td><td>${c.status}</td><td>${new Date(c.created_at).toISOString()}</td></tr>`).join('')}
  </tbody></table>
  </body></html>`;
  res.status(200).send(html);
});

app.post('/cases', express.urlencoded({ extended: true }), async (req, res) => {
  const token = req.query.token;
  const userId = token ? tokenToUserId.get(String(token)) : undefined;
  if (!userId) return res.redirect('/login');
  const { title, description } = req.body || {};
  if (!title) return res.status(400).send('Missing title');
  await pool.query('INSERT INTO fir_cases (title, description, created_by) VALUES ($1, $2, $3)', [title, description || null, userId]);
  return res.redirect(`/cases?token=${token}`);
});

app.post('/anomaly/threshold', express.urlencoded({ extended: true }), async (req, res) => {
  const token = req.query.token;
  const userId = token ? tokenToUserId.get(String(token)) : undefined;
  if (!userId) return res.redirect('/login');
  const zStr = (req.body && (req.body.z_threshold || req.body.zThreshold)) || '';
  const z = parseFloat(zStr);
  if (!Number.isFinite(z) || z <= 0 || z > 10) {
    return res.redirect(`/cases?token=${token}`);
  }
  await setAnomalyThreshold(z);
  return res.redirect(`/cases?token=${token}`);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"]+/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function start() {
  // Retry wrapper for DB init to be resilient on startup ordering
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await runMigrationsAndSeed();
      // eslint-disable-next-line no-console
      console.log('FIR migrations and admin seed done');
      break;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`FIR migration/seed error (attempt ${attempt}/${maxAttempts}):`, err && err.message ? err.message : err);
      if (attempt === maxAttempts) {
        // eslint-disable-next-line no-console
        console.error('FIR failed to initialize DB after max attempts');
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`FIR listening on ${port}`);
  });
}

start();
