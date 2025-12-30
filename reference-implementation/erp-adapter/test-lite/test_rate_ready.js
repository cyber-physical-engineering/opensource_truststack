// Unit-lite tests for erp-adapter. Requires adapter running on ERP_ADAPTER_URL.
// Usage: node erp-adapter/test-lite/test_rate_ready.js

const base = process.env.ERP_ADAPTER_URL || 'http://localhost:3040';

async function getJson(path) {
  const r = await fetch(base + path, { cache: 'no-store' });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, json: j, text };
}

async function postJson(path, body) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, json: j, text };
}

async function testReadyz() {
  const r = await getJson('/readyz');
  if (!r.ok) throw new Error(`/readyz not OK (${r.status}) when ERP_URL is expected unset`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function testRateLimit() {
  const a = await postJson('/erp/event', { event: 'test', ts: Date.now() });
  if (!a.ok) throw new Error(`/erp/event first post failed (${a.status})`);
  const b = await postJson('/erp/event', { event: 'test2', ts: Date.now() });
  if (b.ok || b.status !== 429) throw new Error(`expected 429 on second immediate POST, got ${b.status}`);
  await sleep(1100);
  const c = await postJson('/erp/event', { event: 'test3', ts: Date.now() });
  if (!c.ok) throw new Error(`third POST after interval failed (${c.status})`);
}

(async () => {
  try {
    await testReadyz();
    await testRateLimit();
    console.log('OK: readyz and rate-limit basic behavior');
    process.exit(0);
  } catch (e) {
    console.error('FAIL:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();


