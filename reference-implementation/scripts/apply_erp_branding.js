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
    /* optional */
  }
}
loadDotEnv();

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error('Node >= 18 required (global fetch/FormData/Blob).');
  process.exit(2);
}

const base = (process.env.ERP_API_URL || '').replace(/\/+$/, '');
if (!base) {
  console.error('Missing ERP_API_URL in environment.');
  process.exit(1);
}
const hostHeader = process.env.ERP_API_HOST_HEADER || process.env.ERP_SITE_NAME || null;
const siteHeader = process.env.ERP_SITE_NAME || process.env.ERP_API_HOST_HEADER || null;
const adminUser = process.env.ERP_BOOTSTRAP_ADMIN_USER || 'Administrator';
const debug = process.env.DEBUG_BRAND === '1';

let authHeader = null;
let cookieHeader = null;
if (process.env.ERP_API_KEY && process.env.ERP_API_SECRET) {
  authHeader = `token ${process.env.ERP_API_KEY}:${process.env.ERP_API_SECRET}`;
}

async function http(method, url, { json, form, headers, rawBody, contentType } = {}) {
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
  if (rawBody !== undefined) {
    body = rawBody;
    if (contentType) h['Content-Type'] = contentType;
  } else if (json !== undefined) {
    h['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    h['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  if (debug) {
    console.log(`[HTTP] ${method} ${url}`);
    console.log('  headers:', h);
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

function readBytes(fileRel) {
  const full = path.resolve(process.cwd(), fileRel);
  return fs.readFileSync(full);
}

async function ensureAuth() {
  // Phase A: gateway up
  await http('GET', `${base}/api/method/ping`);

  if (authHeader) return;

  const usr = process.env.ERP_BOOTSTRAP_ADMIN_EMAIL;
  const pwd = process.env.ERP_BOOTSTRAP_ADMIN_PASSWORD;
  if (!pwd) throw new Error('Missing admin password: set ERP_BOOTSTRAP_ADMIN_PASSWORD');

  const loginCandidates = [];
  if (adminUser) loginCandidates.push(adminUser);
  if (usr && !loginCandidates.includes(usr)) loginCandidates.push(usr);

  let res;
  let lastErr;
  for (const candidate of loginCandidates) {
    try {
      ({ res } = await http('POST', `${base}/api/method/login`, { form: { usr: candidate, pwd } }));
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!res) throw lastErr || new Error('Unable to authenticate with provided credentials');

  const rawCookies =
    (typeof res.headers.raw === 'function' && res.headers.raw()['set-cookie']) ||
    (typeof res.headers.getSetCookie === 'function' && res.headers.getSetCookie()) ||
    (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  if (!rawCookies || rawCookies.length === 0) {
    throw new Error('Login did not return Set-Cookie');
  }
  cookieHeader = rawCookies.map(c => c.split(';')[0]).join('; ');

  // Generate or fetch API keys for subsequent calls
  try {
    const { data } = await http(
      'POST',
      `${base}/api/method/frappe.core.doctype.user.user.generate_keys`,
      { form: { user: adminUser } }
    );
    const msg = data?.message || {};
    const apiKey = msg.api_key;
    const apiSecret = msg.api_secret;
    if (apiKey && apiSecret) {
      authHeader = `token ${apiKey}:${apiSecret}`;
    }
  } catch {
    /* keygen can fail if keys already exist; cookie auth will still work */
  }
}

async function uploadFileReturnUrl(bytes, filename, mimetype) {
  const form = new FormData();
  const blob = new Blob([bytes], { type: mimetype || 'application/octet-stream' });
  form.append('file', blob, filename);
  form.append('is_private', '0');
  // Note: do not set Content-Type; fetch will add multipart boundary
  const { data } = await http('POST', `${base}/api/method/upload_file`, {
    rawBody: form,
    headers: {}, // http() will attach Host, Site, Cookie/Authorization
  });
  const fileUrl = data?.message?.file_url || data?.file_url || data?.message?.location || null;
  if (!fileUrl) {
    throw new Error('Upload did not return file_url');
  }
  return fileUrl;
}

async function updateWebsiteSettings({ brand_image, favicon }) {
  const payload = {};
  if (brand_image) payload.brand_image = brand_image;
  if (favicon) payload.favicon = favicon;
  if (!Object.keys(payload).length) return;
  await http(
    'PUT',
    `${base}/api/resource/${encodeURIComponent('Website Settings')}/${encodeURIComponent('Website Settings')}`,
    { json: payload }
  );
}

(async function main() {
  try {
    await ensureAuth();

    const logoPath = process.env.ERP_BRAND_LOGO || 'branding/logo.png';
    const faviconPath = process.env.ERP_BRAND_FAVICON || 'branding/favicon.png';
    if (!fs.existsSync(logoPath)) throw new Error(`Missing logo at ${logoPath}`);
    if (!fs.existsSync(faviconPath)) throw new Error(`Missing favicon at ${faviconPath}`);

    const logoBytes = readBytes(logoPath);
    const faviconBytes = readBytes(faviconPath);

    const logoUrl = await uploadFileReturnUrl(logoBytes, path.basename(logoPath), 'image/png');
    const favExt = path.extname(faviconPath).toLowerCase();
    const favMime = favExt === '.ico' ? 'image/x-icon' : 'image/png';
    const faviconUrl = await uploadFileReturnUrl(faviconBytes, path.basename(faviconPath), favMime);

    await updateWebsiteSettings({ brand_image: logoUrl, favicon: faviconUrl });

    console.log(`OK: Website Settings updated. logo=${logoUrl} favicon=${faviconUrl}`);
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();


