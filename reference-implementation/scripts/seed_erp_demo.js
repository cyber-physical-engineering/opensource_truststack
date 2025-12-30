'use strict';

const fs = require('fs');
const path = require('path');

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
    /* no-op if .env missing */
  }
}
loadDotEnv();

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error('Node >= 18 required (global fetch).');
  process.exit(2);
}

const base = (process.env.ERP_API_URL || '').replace(/\/+$/, '');
if (!base) {
  console.error('Missing ERP_API_URL in environment.');
  process.exit(1);
}
const hostHeader = process.env.ERP_API_HOST_HEADER || process.env.ERP_SITE_NAME || null;
const siteHeader = process.env.ERP_SITE_NAME || process.env.ERP_API_HOST_HEADER || null;
const debug = process.env.DEBUG_SEED === '1';

let authHeader = null;
let cookieHeader = null;
const adminUser = process.env.ERP_BOOTSTRAP_ADMIN_USER || 'Administrator';
if (process.env.ERP_API_KEY && process.env.ERP_API_SECRET) {
  authHeader = `token ${process.env.ERP_API_KEY}:${process.env.ERP_API_SECRET}`;
}

async function http(method, url, { json, form, headers } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (hostHeader && !('Host' in h) && !('host' in h)) {
    h.Host = hostHeader;
  }
  if (siteHeader && !('X-Frappe-Site-Name' in h) && !('x-frappe-site-name' in h)) {
    h['X-Frappe-Site-Name'] = siteHeader;
  }
  if (authHeader) h.Authorization = authHeader;
  if (cookieHeader) h.Cookie = cookieHeader;
  let body;
  if (json !== undefined) {
    h['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    h['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  if (debug) {
    console.log(`[HTTP] ${method} ${url}`);
    console.log('  headers:', h);
    if (json !== undefined) console.log('  json:', json);
    if (form) console.log('  form:', form);
  }
  const res = await fetch(url, { method, headers: h, body });
  const text = await res.text();
  if (debug) {
    console.log('  status:', res.status);
    console.log('  raw response:', text);
  }
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

function writeJSON(rel, obj) {
  const full = path.resolve(process.cwd(), rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(obj, null, 2));
}

async function ensureAuth() {
  await http('GET', `${base}/api/method/ping`);

  if (authHeader) return;

  const usr = process.env.ERP_BOOTSTRAP_ADMIN_EMAIL;
  const pwd = process.env.ERP_BOOTSTRAP_ADMIN_PASSWORD;
  if (!pwd) {
    throw new Error('Missing admin password: ERP_BOOTSTRAP_ADMIN_PASSWORD');
  }

  const loginCandidates = [];
  if (adminUser) loginCandidates.push(adminUser);
  if (usr && !loginCandidates.includes(usr)) loginCandidates.push(usr);

  let loginId = null;
  let res;
  let lastErr;
  for (const candidate of loginCandidates) {
    try {
      ({ res } = await http('POST', `${base}/api/method/login`, { form: { usr: candidate, pwd } }));
      loginId = candidate;
      break;
    } catch (err) {
      lastErr = err;
      continue;
    }
  }
  if (!loginId) {
    throw lastErr || new Error('Unable to authenticate with provided admin credentials');
  }
  const rawCookies =
    (typeof res.headers.raw === 'function' && res.headers.raw()['set-cookie']) ||
    (typeof res.headers.getSetCookie === 'function' && res.headers.getSetCookie()) ||
    (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  if (!rawCookies || rawCookies.length === 0) {
    throw new Error('Login did not return Set-Cookie');
  }
  cookieHeader = rawCookies.map(c => c.split(';')[0]).join('; ');

  const { data } = await http(
    'POST',
    `${base}/api/method/frappe.core.doctype.user.user.generate_keys`,
    { form: { user: adminUser } }
  );
  const msg = data?.message || {};
  let apiKey = msg.api_key;
  let apiSecret = msg.api_secret;
  if (!apiKey || !apiSecret) {
    const userResp = await http(
      'GET',
      `${base}/api/resource/${encodeURIComponent('User')}/${encodeURIComponent(adminUser)}?fields=${encodeURIComponent(JSON.stringify(['api_key', 'api_secret']))}`
    );
    const userData = userResp?.data?.data || userResp?.data;
    apiKey = apiKey || userData?.api_key || null;
    apiSecret = apiSecret || userData?.api_secret || null;
  }
  if (!apiKey || !apiSecret) throw new Error('Failed to generate API keys');
  writeJSON('state/erp_auth.json', {
    user: adminUser,
    login: loginId,
    api_key: apiKey,
    api_secret: apiSecret,
    ts: new Date().toISOString(),
  });
  authHeader = `token ${apiKey}:${apiSecret}`;
}

async function findOne(doctype, filters, fields = ['name']) {
  const qs = new URLSearchParams({
    filters: JSON.stringify(filters || []),
    fields: JSON.stringify(fields),
    limit_page_length: '1',
  });
  const { data } = await http('GET', `${base}/api/resource/${encodeURIComponent(doctype)}?${qs.toString()}`);
  const items = data?.data || [];
  return items[0] || null;
}

async function listAll(doctype, filters, fields = ['name'], limit = 100) {
  const qs = new URLSearchParams({
    filters: JSON.stringify(filters || []),
    fields: JSON.stringify(fields),
    limit_page_length: String(limit),
  });
  const { data } = await http('GET', `${base}/api/resource/${encodeURIComponent(doctype)}?${qs.toString()}`);
  return data?.data || [];
}

async function createDoc(doctype, doc) {
  const { data } = await http('POST', `${base}/api/resource/${encodeURIComponent(doctype)}`, { json: doc });
  return data?.data || data;
}

async function fetchDoc(doctype, name) {
  const { data } = await http('GET', `${base}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  return data?.data || data;
}

async function submitDoc(doc) {
  if (!doc || !doc.doctype || !doc.name) return;
  await http('POST', `${base}/api/method/frappe.client.submit`, { json: { doc } });
}

async function ensureCompany() {
  let comp = await findOne('Company', [['company_name', '=', 'DemoCo']], ['name', 'abbr', 'company_name']);
  if (!comp) {
    try {
      comp = await createDoc('Company', {
        company_name: 'DemoCo',
        abbr: 'DC',
        country: 'United States',
        default_currency: 'USD',
      });
    } catch {
      const first = await findOne('Company', [], ['name', 'abbr', 'company_name']);
      if (!first) throw new Error('No Company found and could not create DemoCo');
      comp = first;
    }
  }
  return comp;
}

async function ensureWarehouseTypes() {
  const required = ['Finished Goods', 'Raw Material', 'Stores', 'Transit'];
  for (const wt of required) {
    const existing = await findOne('Warehouse Type', [['name', '=', wt]], ['name']);
    if (existing) continue;
    try {
      await createDoc('Warehouse Type', { name: wt, description: `${wt} warehouse type` });
      if (debug) console.log(`Created Warehouse Type ${wt}`);
    } catch (err) {
      if (debug) console.warn(`Skipping Warehouse Type ${wt}: ${err.message}`);
    }
  }
}

async function ensureUOM(uom) {
  const existing = await findOne('UOM', [['name', '=', uom]], ['name']);
  if (existing) return existing;
  try {
    const created = await http(
      'POST',
      `${base}/api/method/frappe.client.insert`,
      { json: { doc: { doctype: 'UOM', uom_name: uom } } }
    );
    if (debug) console.log(`Created UOM ${uom}`);
    return created?.data;
  } catch (err) {
    if (debug) console.warn(`Skipping UOM ${uom}: ${err.message}`);
    return await findOne('UOM', [['name', '=', uom]], ['name']);
  }
}

async function ensureItemGroupRoot(name) {
  const existing = await findOne('Item Group', [['name', '=', name]], ['name']);
  if (existing) return existing;
  const payload = {
    doc: {
      doctype: 'Item Group',
      item_group_name: name,
      is_group: 1,
    },
  };
  const created = await http(
    'POST',
    `${base}/api/method/frappe.client.insert`,
    { json: payload }
  );
  if (debug) console.log(`Created Item Group root ${name}`);
  return created?.data;
}
async function ensureItem(code, name, extra = {}) {
  const existing = await findOne('Item', [['item_code', '=', code]], ['name', 'item_code']);
  if (existing) return existing;
  return await createDoc('Item', {
    item_code: code,
    item_name: name || code,
    stock_uom: 'Nos',
    item_group: 'All Item Groups',
    is_stock_item: extra.is_stock_item ?? 1,
    ...extra,
  });
}

async function ensureBOM(companyName) {
  let bom = await findOne('BOM', [['item', '=', 'ITEM-1'], ['company', '=', companyName]], ['name', 'item', 'company', 'is_default', 'docstatus']);
  if (bom) {
    if (bom.docstatus !== 1) {
      try {
        const doc = await fetchDoc('BOM', bom.name);
        await submitDoc(doc);
        bom.docstatus = 1;
      } catch (err) {
        if (debug) console.warn(`Failed to submit existing BOM ${bom.name}: ${err.message}`);
      }
    }
    return bom;
  }
  const created = await createDoc('BOM', {
    company: companyName,
    item: 'ITEM-1',
    quantity: 1,
    is_active: 1,
    is_default: 1,
    items: [{ item_code: 'ITEM-1-RM', qty: 1, uom: 'Nos' }],
    currency: 'USD',
    conversion_rate: 1,
  });
  try {
    const bomName = created?.name || created?.data?.name;
    if (bomName) {
      const doc = await fetchDoc('BOM', bomName);
      await submitDoc(doc);
      created.name = bomName;
      created.docstatus = 1;
    }
  } catch (err) {
    if (debug) console.warn(`Failed to submit BOM ${created.name}: ${err.message}`);
  }
  return created;
}

async function ensureWorkstation() {
  let ws = await findOne('Workstation', [['workstation_name', '=', 'WC-1']], ['name', 'workstation_name']);
  if (ws) return ws;
  return await createDoc('Workstation', { workstation_name: 'WC-1' });
}

async function pickWarehouse(companyName, kindRegex) {
  const list = await listAll('Warehouse', [['company', '=', companyName]], ['name', 'company'], 100);
  const match = list.find(w => new RegExp(kindRegex, 'i').test(w.name));
  return (match || list[0])?.name;
}

async function ensureWorkOrder(companyName, bomName) {
  let wo = await findOne('Work Order', [['production_item', '=', 'ITEM-1'], ['company', '=', companyName]], ['name', 'status']);
  if (wo) return wo;
  const fg = await pickWarehouse(companyName, 'Finished\\s*Goods');
  const wip = await pickWarehouse(companyName, 'Work\\s*In\\s*Progress|WIP');
  const payload = { production_item: 'ITEM-1', qty: 1, bom_no: bomName, company: companyName };
  if (fg) payload.fg_warehouse = fg;
  if (wip) payload.wip_warehouse = wip;
  return await createDoc('Work Order', payload);
}

(async function main() {
  try {
    await ensureAuth();

    await ensureUOM('Nos');
    await ensureItemGroupRoot('All Item Groups');
    await ensureWarehouseTypes();
    const company = await ensureCompany();
    const itemFg = await ensureItem('ITEM-1', 'ITEM-1');
    const itemRm = await ensureItem('ITEM-1-RM', 'ITEM-1-RM', { is_stock_item: 0 });
    const bom = await ensureBOM(company.name);
    const ws = await ensureWorkstation();
    const wo = await ensureWorkOrder(company.name, bom.name);

    const out = {
      company: company.name,
      item_fg: itemFg.name,
      item_rm: itemRm.name,
      bom: bom.name,
      workstation: ws.name,
      work_order: wo.name,
      ts: new Date().toISOString(),
    };
    writeJSON('state/erp_seed.json', out);
    console.log(`OK: company=${out.company}, item=${out.item_fg}, bom=${out.bom}, wc=${out.workstation}, wo=${out.work_order}`);
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();


