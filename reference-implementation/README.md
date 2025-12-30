# TrustStack™ Suite — Reference Implementation

A lightweight, Docker Compose driven demo stack including:
- **Landing/Status UI**: Central dashboard.
- **OpenObserve**: Logs and observability.
- **FIR**: Incident response demo.
- **Grafana**: Dashboards.
- **Simulator**: Generates telemetry and anomaly signals.
- **Anomaly**: Simple z-score/EMA detector.
- **ERP Adapter**: Demo bridge to ERP/MES-lite.

## Quick Start

1. **Configure environment**:
   ```bash
   cp env.example .env
   # Edit .env to set your own secure passwords if deploying beyond localhost
   ```

2. **Start the stack**:
   ```bash
   docker compose up --build -d
   ```

2. **Access the services**:
   - Landing:  http://localhost:3030
   - FAQs (Credentials): http://localhost:3034
   - OpenObserve: http://localhost:3031
   - FIR: http://localhost:3032
   - Grafana: http://localhost:3033

## ERPNext Profile (MES Lite)

To run the ERPNext demo component:

1. Add `127.0.0.1 site.local` to your `/etc/hosts` file.
2. Run with the `mes` profile:
   ```bash
   docker compose --profile mes up -d
   ```
3. Access ERPNext at http://site.local:3036.

## Configuration

Configuration is handled via `.env` files and environment variables in `docker-compose.yml`.
See `env.example` for a template.

### Default Credentials
*These match the defaults in `env.example`. Check your `.env` file if you changed them.*

- **OpenObserve**: `admin@example.com` / `ChangeMe!123`
- **Grafana**: `admin` / `ChangeMe!123`
- **FIR**: `admin@local` / `ChangeMe!123`

**Warning**: These are default credentials for demonstration purposes only. Rotate all secrets and configure persistent storage for production use.

## Architecture

- **Postgres**: Primary data store.
- **OpenObserve**: Ingests logs and metrics from the Simulator.
- **Simulator**: Generates synthetic "heartbeat" and "batch" events.
- **Anomaly**: Analyzes simulator data stream for statistical anomalies.
- **ERP Bridge**: Connects ERPNext events to the observability pipeline.

## Development

To run locally with hot-reload for the Node.js services (Landing, Simulator), you can run them outside of Docker while keeping the infrastructure (Postgres, OpenObserve) in Docker.

See `Makefile` for common tasks if available.
