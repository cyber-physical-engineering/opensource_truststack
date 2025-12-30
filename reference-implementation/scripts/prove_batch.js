'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadDotEnv(file = '.env') {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* ignore */
  }
}
loadDotEnv();

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error('Node >= 18 required (global fetch).');
  process.exit(2);
}

let canonicalize;
try {
  ({ canonicalize } = require('json-canonicalize'));
} catch {
  console.error('Missing dependency: json-canonicalize. Install with: npm i json-canonicalize');
  process.exit(2);
}

function arg(key, def) {
  const i = process.argv.findIndex((a) => a === `--${key}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  const kv = process.argv.find((a) => a.startsWith(`--${key}=`));
  if (kv) return kv.slice(key.length + 3);
  return def;
}

const recordId = arg('record-id') || arg('record') || process.env.RECORD_ID;
const caseIdArg = arg('case-id') || process.env.CASE_ID;
if (!recordId) {
  console.error('Usage: node scripts/prove_batch.js --record-id <ID> [--case-id <CASE_ID>]');
  process.exit(1);
}

const erpBase = (process.env.ERP_API_URL || '').replace(/\/+$/, '');
const hostHeader = process.env.ERP_API_HOST_HEADER || process.env.ERP_SITE_NAME || null;
const apiKey = process.env.ERP_API_KEY || '';
const apiSecret = process.env.ERP_API_SECRET || '';
const firUrl = (process.env.FIR_URL || 'http://localhost:3032').replace(/\/+$/, '');
const firToken = process.env.FIR_SERVICE_TOKEN || '';
const proveFixture = process.env.PROVE_FIXTURE || 'fixtures/batch_record.json';

async function http(method, url, { json, headers } = {}) {
  const h = { Accept: 'application/json', ...headers };
  let body;
  if (json !== undefined) {
    h['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const res = await fetch(url, { method, headers: h, body });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || data?.exc || text || res.statusText;
    const err = new Error(`${method} ${url} -> ${res.status} ${msg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { res, data };
}

async function fetchErpWorkOrder(name) {
  if (!erpBase || !apiKey || !apiSecret) return null;
  const headers = { Authorization: `token ${apiKey}:${apiSecret}` };
  if (hostHeader) headers.Host = hostHeader;
  const url = `${erpBase}/api/resource/${encodeURIComponent('Work Order')}/${encodeURIComponent(name)}`;
  const { data } = await http('GET', url, { headers });
  return data?.data || data || null;
}

function loadFixture() {
  const full = path.resolve(process.cwd(), proveFixture);
  const txt = fs.readFileSync(full, 'utf8');
  return JSON.parse(txt);
}

async function ensureFirCaseId(preferredId, titleIfCreate) {
  if (preferredId) return parseInt(preferredId, 10);
  if (!firToken) throw new Error('Missing FIR_SERVICE_TOKEN for FIR API');
  const { data } = await http('POST', `${firUrl}/api/cases`, {
    json: { title: titleIfCreate, description: 'Auto-created by prove_batch' },
    headers: { 'X-Service-Token': firToken },
  });
  return data?.id;
}

async function postFirNote(caseId, body, hash) {
  if (!firToken) throw new Error('Missing FIR_SERVICE_TOKEN for FIR API');
  const { data } = await http('POST', `${firUrl}/api/cases/${caseId}/notes`, {
    json: { body, hash },
    headers: { 'X-Service-Token': firToken },
  });
  return data;
}

(async function main() {
  try {
    let source = 'fixture';
    let record = null;

    // Try ERP if configured
    if (erpBase && apiKey && apiSecret) {
      const wo = await fetchErpWorkOrder(recordId).catch(() => null);
      if (wo) {
        source = 'erp';
        record = {
          record_id: String(wo.name || recordId),
          doctype: 'Work Order',
          fields: {
            name: String(wo.name || ''),
            status: String(wo.status || ''),
            production_item: String(wo.production_item || ''),
            qty: Number(wo.qty || 0),
            bom_no: String(wo.bom_no || ''),
          },
        };
      }
    }
    if (!record) {
      const fx = loadFixture();
      record = {
        record_id: String(fx.record_id || recordId),
        doctype: String(fx.doctype || 'Work Order'),
        fields: fx.fields || {
          name: fx.name || String(recordId),
          status: fx.status || 'Draft',
          production_item: fx.production_item || 'ITEM-1',
          qty: Number(fx.qty || 1),
          bom_no: fx.bom_no || 'BOM-ITEM-1',
        },
      };
    }

    const canonical = canonicalize(record);
    const hash = crypto.createHash('sha384').update(canonical).digest('hex');
    const ts = new Date().toISOString();

    console.log(JSON.stringify({ record_id: record.record_id, hash, ts }, null, 2));

    const title = `Proof for ${record.record_id}`;
    const noteBody = `RFC8785 canonical SHA-384\nrecord_id=${record.record_id}\nhash=${hash}\nts=${ts}\nsource=${source}`;
    const cid = await ensureFirCaseId(caseIdArg, title);
    const r = await postFirNote(cid, noteBody, hash);
    if (r && r.dedup) {
      console.log(`OK: note already present (idempotent) on case ${cid}`);
    } else {
      console.log(`OK: note stored on case ${cid}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message || String(err));
    process.exit(1);
  }
})();


