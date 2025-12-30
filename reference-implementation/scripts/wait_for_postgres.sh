#!/usr/bin/env bash
set -euo pipefail

# Move to repo root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not on PATH. Please install Docker Desktop and retry."
  exit 127
fi

COMPOSE_PROJECT_NAME_ENV=${COMPOSE_PROJECT_NAME:-truststack}

echo "Bringing up Postgres via compose (project: ${COMPOSE_PROJECT_NAME_ENV})..."
docker compose up -d postgres

# Resolve the actual container ID and name
CONTAINER_ID="$(docker compose ps -q postgres)"
if [[ -z "$CONTAINER_ID" ]]; then
  echo "Postgres container not found (compose ps -q postgres returned empty)."
  exit 1
fi
CONTAINER_NAME="$(docker inspect -f '{{.Name}}' "$CONTAINER_ID" | sed 's#^/##')"
echo "Waiting for container health: ${CONTAINER_NAME}"

# Wait up to ~60s for healthy
for i in {1..30}; do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER_ID" 2>/dev/null || echo "unknown")"
  if [[ "$status" == "healthy" ]]; then
    echo "Postgres is healthy ✅"
    docker exec "$CONTAINER_ID" pg_isready -U "${PGUSER:-truststack}" -d "${PGDATABASE:-truststack}" || true
    exit 0
  fi
  if [[ "$status" == "unhealthy" ]]; then
    echo "Postgres reported unhealthy. Showing recent logs:"
    docker compose logs --no-color --since=2m postgres || true
    exit 1
  fi
  sleep 2
done

echo "Timed out waiting for healthy state. Recent logs:"
docker compose logs --no-color --since=2m postgres || true
exit 1


