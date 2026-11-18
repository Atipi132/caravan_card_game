#!/usr/bin/env bash
# Deploys a new version of Caravan on the VPS. Run from /opt/caravan (the workflow does it over SSH).
#
#   DOMAIN=caravan-me.duckdns.org CARAVAN_IMAGE=ghcr.io/me/caravan:abc123 ./deploy.sh
#
# Games live in memory, so restarting the container ends games in progress. To be nice to players,
# the script waits (up to WAIT_IDLE_MAX seconds) for running games to finish before switching versions.
set -euo pipefail
cd "$(dirname "$0")"

: "${DOMAIN:?DOMAIN is required}"
: "${CARAVAN_IMAGE:?CARAVAN_IMAGE is required}"
WAIT_IDLE_MAX="${WAIT_IDLE_MAX:-600}"

cat > .env <<EOF
DOMAIN=${DOMAIN}
CARAVAN_IMAGE=${CARAVAN_IMAGE}
EOF

echo "==> Pulling ${CARAVAN_IMAGE}"
# SKIP_PULL=1 lets you try the stack locally with an image built on your machine.
if [ "${SKIP_PULL:-0}" != "1" ]; then docker compose pull --quiet; fi

# Wait for running games to end (only if the game container is already up).
if docker compose ps --status running --services 2>/dev/null | grep -qx caravan; then
  waited=0
  while :; do
    games=$(docker compose exec -T caravan wget -qO- http://127.0.0.1:3000/healthz 2>/dev/null | sed -n 's/.*"games":\([0-9]*\).*/\1/p' || true)
    games=${games:-0}
    if [ "$games" -eq 0 ]; then break; fi
    if [ "$waited" -ge "$WAIT_IDLE_MAX" ]; then
      echo "==> ${games} game(s) still running after ${WAIT_IDLE_MAX}s, deploying anyway"
      break
    fi
    echo "==> ${games} game(s) in progress, waiting... (${waited}s)"
    sleep 15
    waited=$((waited + 15))
  done
fi

echo "==> Starting"
docker compose up -d --remove-orphans

echo "==> Waiting for the health check"
for i in $(seq 1 30); do
  if docker compose exec -T caravan wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    echo "==> Caravan is up: https://${DOMAIN}"
    docker image prune -af --filter "until=168h" >/dev/null || true
    exit 0
  fi
  sleep 2
done
echo "!! Caravan did not become healthy" >&2
docker compose logs --tail 50 caravan >&2
exit 1
