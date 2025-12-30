SHELL := /bin/bash

# Load environment variables safely (only KEY=VALUE lines) for optional use in recipes
ENV_FILE := .env
ENV_MK   := .env.mk
ifneq ("$(wildcard $(ENV_FILE))","")
$(ENV_MK): $(ENV_FILE)
	@grep -E '^[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' $(ENV_FILE) > $(ENV_MK)
-include $(ENV_MK)
export
endif

DOCKER_COMPOSE := docker compose

.PHONY: up down logs ps config psql env-validate help pg-health ui ui-logs ui-down sanity oo oo-logs oo-down oo-health fir fir-logs fir-down fir-health grafana grafana-logs grafana-down grafana-health anomaly anomaly-logs anomaly-down anomaly-health prometheus prometheus-logs prometheus-down

help:
	@echo "Available targets:"
	@echo "  up             - Start Postgres container"
	@echo "  down           - Stop and remove containers"
	@echo "  logs           - Tail Postgres logs"
	@echo "  ps             - Show compose services"
	@echo "  config         - Validate and view compose config"
	@echo "  psql           - Connect to Postgres with psql (optional)"
	@echo "  env-validate   - Check required .env vars are set"
	@echo "  ui             - Start landing UI on port $${LANDING_PORT:-3005}"
	@echo "  ui-logs        - Tail landing logs"
	@echo "  ui-down        - Stop landing UI"
	@echo "  sanity         - Run basic config/ps/DB checks (non-interactive)"
		@echo "  oo             - Start OpenObserve and wait for readiness"
		@echo "  oo-logs        - Tail OpenObserve logs"
		@echo "  oo-down        - Stop OpenObserve"
		@echo "  oo-health      - Wait for OpenObserve /healthz"
		@echo "  fir            - Start FIR and wait for readiness"
		@echo "  fir-logs       - Tail FIR logs"
		@echo "  fir-down       - Stop FIR"
		@echo "  fir-health     - Wait for FIR /healthz"
		@echo "  grafana        - Start Grafana and wait for readiness"
		@echo "  grafana-logs   - Tail Grafana logs"
		@echo "  grafana-down   - Stop Grafana"
		@echo "  grafana-health - Wait for Grafana /api/health"
		@echo "  anomaly        - Start Anomaly and wait for readiness"
		@echo "  anomaly-logs   - Tail Anomaly logs"
		@echo "  anomaly-down   - Stop Anomaly"
		@echo "  anomaly-health - Wait for Anomaly /healthz"
		@echo "  prometheus     - Start Prometheus"
		@echo "  prometheus-logs- Tail Prometheus logs"
		@echo "  prometheus-down- Stop Prometheus"

up: env-validate
	$(DOCKER_COMPOSE) up -d postgres

down:
	$(DOCKER_COMPOSE) down

logs:
	$(DOCKER_COMPOSE) logs -f postgres

ps:
	$(DOCKER_COMPOSE) ps

config:
	$(DOCKER_COMPOSE) config

psql:
	psql -h localhost -p $${PGPORT:-5432} -U $${PGUSER:-truststack} -d $${PGDATABASE:-truststack}

env-validate:
	@missing=0; \
	for var in PGUSER PGPASSWORD PGDATABASE PGPORT; do \
	  if [ -z "$$${var}" ]; then echo "Missing $${var} in .env"; missing=1; fi; \
	done; \
	if [ $$missing -ne 0 ]; then \
	  echo "Environment validation failed. Copy .env.example to .env and update values."; \
	  exit $$missing; \
	fi

pg-health:
	bash scripts/wait_for_postgres.sh

ui:
	$(DOCKER_COMPOSE) up -d landing

ui-logs:
	$(DOCKER_COMPOSE) logs -f landing

ui-down:
	$(DOCKER_COMPOSE) stop landing

sanity:
	@echo "[1/4] docker compose config" && \
	$(DOCKER_COMPOSE) config >/dev/null && echo "OK" || { echo "FAILED"; exit 1; }
	@echo "[2/4] docker compose ps" && \
	$(DOCKER_COMPOSE) ps
	@echo "[3/4] pg_isready inside container" && \
	CONTAINER_NAME=$${COMPOSE_PROJECT_NAME:-truststack}_postgres; \
	docker exec $$CONTAINER_NAME pg_isready -U $${PGUSER:-truststack} -d $${PGDATABASE:-truststack}
	@echo "[4/4] SELECT 1" && \
	CONTAINER_NAME=$${COMPOSE_PROJECT_NAME:-truststack}_postgres; \
	docker exec -e PGPASSWORD=$${PGPASSWORD} $$CONTAINER_NAME sh -lc "psql -U $${PGUSER} -d $${PGDATABASE} -tAc 'SELECT 1'" | grep -q '^1$$' && echo "SELECT 1 OK" || { echo "SELECT 1 FAILED"; exit 1; }

oo:
	$(DOCKER_COMPOSE) up -d openobserve
	$(MAKE) oo-health

oo-logs:
	$(DOCKER_COMPOSE) logs -f openobserve

oo-down:
	$(DOCKER_COMPOSE) stop openobserve

oo-health:
	@echo "Waiting for OpenObserve at $${OO_URL:-http://localhost:3031}/ ..."; \
	for i in `seq 1 60`; do \
	  if curl -sf "$${OO_URL:-http://localhost:3031}/" >/dev/null; then echo "OpenObserve is ready"; exit 0; fi; \
	  sleep 1; \
	done; \
	echo "OpenObserve not ready after timeout"; exit 1

grafana:
	$(DOCKER_COMPOSE) up -d grafana
	$(MAKE) grafana-health

grafana-logs:
	$(DOCKER_COMPOSE) logs -f grafana

grafana-down:
	$(DOCKER_COMPOSE) stop grafana

grafana-health:
	@echo "Waiting for Grafana at $${GRAFANA_URL:-http://localhost:3033}/api/health ..."; \
	for i in `seq 1 60`; do \
	  if curl -sf "$${GRAFANA_URL:-http://localhost:3033}/api/health" >/dev/null; then echo "Grafana is ready"; exit 0; fi; \
	  sleep 1; \
	done; \
	echo "Grafana not ready after timeout"; exit 1

fir:
	$(DOCKER_COMPOSE) up -d fir
	$(MAKE) fir-health

fir-logs:
	$(DOCKER_COMPOSE) logs -f fir

fir-down:
	$(DOCKER_COMPOSE) stop fir

fir-health:
	@echo "Waiting for FIR at $${FIR_URL:-http://localhost:3032}/healthz ..."; \
	for i in `seq 1 60`; do \
	  if curl -sf "$${FIR_URL:-http://localhost:3032}/healthz" >/dev/null; then echo "FIR is ready"; exit 0; fi; \
	  sleep 1; \
	done; \
	echo "FIR not ready after timeout"; exit 1

anomaly:
	$(DOCKER_COMPOSE) up -d anomaly
	$(MAKE) anomaly-health

anomaly-logs:
	$(DOCKER_COMPOSE) logs -f anomaly

anomaly-down:
	$(DOCKER_COMPOSE) stop anomaly

anomaly-health:
	@echo "Waiting for Anomaly at $${ANOMALY_URL:-http://localhost:3035}/healthz ..."; \
	for i in `seq 1 60`; do \
	  if curl -sf "$${ANOMALY_URL:-http://localhost:3035}/healthz" >/dev/null; then echo "Anomaly is ready"; exit 0; fi; \
	  sleep 1; \
	done; \
	echo "Anomaly not ready after timeout"; exit 1

prometheus:
	$(DOCKER_COMPOSE) up -d prometheus

prometheus-logs:
	$(DOCKER_COMPOSE) logs -f prometheus

prometheus-down:
	$(DOCKER_COMPOSE) stop prometheus


.PHONY: seed-erp
seed-erp:
	@node scripts/seed_erp_demo.js

.PHONY: prove-batch
prove-batch:
	@node scripts/prove_batch.js --record-id "$(RECORD_ID)" --case-id "$(CASE_ID)"

.PHONY: brand-erp
brand-erp:
	@node scripts/apply_erp_branding.js

