# Trust Stack Demo

A Docker Compose demo. It starts PostgreSQL, OpenObserve, Prometheus and Grafana, plus six small Node.js (Express) services written for it:

- `landing`: a status page that pings each service and starts or stops the simulator.
- `fir`: a minimal case tracker with five seeded demo cases. It is not the open-source FIR project.
- `simulator`: emits a repeating 0 to 99 test signal.
- `anomaly`: flags values whose z-score against an exponential moving average passes a threshold (default 1.5), and can open a case.
- `erp-adapter`: forwards posted JSON events to OpenObserve, rate-limited.
- `erp-bridge`: polls ERPNext for Work Orders changed in the last minute and forwards status changes to OpenObserve.

## Start

```bash
cp env.example .env
docker compose up --build -d
```

Then open:

- Status page: http://localhost:3030
- OpenObserve: http://localhost:3031
- Case tracker: http://localhost:3032
- Grafana: http://localhost:3033
- FAQ page with the demo logins: http://127.0.0.1:3034 (loopback only)

## Demo logins

The defaults are in `env.example` (OpenObserve `admin@example.com`, Grafana `admin`, the case tracker `admin@local`, all with the same demo password). Change every one before any shared use.

## ERPNext profile

`docker compose --profile mes up -d` adds ERPNext v15.17.0 with MariaDB, Redis and nginx. It needs `127.0.0.1 site.local` in your hosts file and amd64 images. It was not run in October 2026; see the limits in the root README before trying it.

## Without Docker

Each service runs on its own: `npm ci`, then `node server.js` in its folder, with the ports and URLs from `env.example`. The case tracker needs PostgreSQL. Two test scripts exist: `npm run test:lite` in `erp-bridge/` (health endpoints) and in `erp-adapter/` (readiness and rate limit; needs the relay running and OpenObserve or a stand-in reachable).

`make env-validate` checks that the four PostgreSQL variables are set.
