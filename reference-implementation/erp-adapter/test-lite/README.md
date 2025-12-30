# erp-adapter unit-lite tests

Prereq: adapter running locally (default host `http://localhost:3040`).

Run:

```bash
node erp-adapter/test-lite/test_rate_ready.js
```

What it checks:
- `/readyz` returns 200 when `ERP_URL` is unset (simulated mode acceptable)
- Rate limit: second immediate POST to `/erp/event` returns 429, and a third POST after ~1.1s succeeds

Override endpoint:

```bash
ERP_ADAPTER_URL=http://localhost:3040 node erp-adapter/test-lite/test_rate_ready.js
```


