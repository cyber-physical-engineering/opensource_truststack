// Minimal health check for erp-bridge
// Usage: node erp-bridge/test-lite/test_health.js [baseUrl]
// Default baseUrl: http://localhost:3037

const base = process.argv[2] || 'http://localhost:3037';

async function main() {
  const h = await fetch(`${base}/healthz`).then(r => ({ ok: r.ok, status: r.status })).catch(() => ({ ok: false }));
  const r = await fetch(`${base}/readyz`).then(r => ({ ok: r.ok, status: r.status })).catch(() => ({ ok: false }));
  if (!h.ok) {
    console.error('Healthz failed', h);
    process.exit(1);
  }
  if (!r.ok) {
    console.log('Readyz not OK (expected if ERP not configured)', r);
  } else {
    console.log('Readyz OK', r);
  }
  console.log('OK: health endpoints');
}

main();


