# erp-adapter test-lite

Prerequisites: the relay running locally (default `http://localhost:3040`), and OpenObserve reachable at the URL the relay is configured with. Without it the first POST gets 502 and the test exits 1.

Run, from inside `erp-adapter/`:

```bash
npm run test:lite
```

Or from `reference-implementation/`:

```bash
node erp-adapter/test-lite/test_rate_ready.js
```

What it checks:

- `/readyz` returns 200 when `ERP_URL` is unset (simulated mode).
- Rate limit: a second immediate POST to `/erp/event` returns 429, and a third POST after about 1.1 s succeeds.

To point the test at another address:

```bash
ERP_ADAPTER_URL=http://localhost:3040 node erp-adapter/test-lite/test_rate_ready.js
```
