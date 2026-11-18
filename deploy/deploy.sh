#!/usr/bin/env bash
# Deploys Caravan to Fly.io (single always-on Machine, European region).
#
#   FLY_API_TOKEN=... ./deploy/deploy.sh
#
# Games live in memory, so restarting the Machine ends games in progress. To be nice to players,
# the script waits (up to WAIT_IDLE_MAX seconds) for running games to finish before deploying.
set -euo pipefail
cd "$(dirname "$0")/.."

APP="${FLY_APP:-$(sed -n "s/^app *= *['\"]\([^'\"]*\)['\"].*/\1/p" fly.toml | head -n1)}"
: "${APP:?set FLY_APP or 'app =' in fly.toml}"
URL="https://${APP}.fly.dev"
WAIT_IDLE_MAX="${WAIT_IDLE_MAX:-600}"

# Wait for running games to end if the app is already live.
if health=$(curl -fsS --max-time 5 "${URL}/healthz" 2>/dev/null); then
  waited=0
  while :; do
    games=$(printf '%s' "$health" | sed -n 's/.*"games":\([0-9]*\).*/\1/p' || true)
    games=${games:-0}
    if [ "$games" -eq 0 ]; then break; fi
    if [ "$waited" -ge "$WAIT_IDLE_MAX" ]; then
      echo "==> ${games} game(s) still running after ${WAIT_IDLE_MAX}s, deploying anyway"
      break
    fi
    echo "==> ${games} game(s) in progress, waiting... (${waited}s)"
    sleep 15
    waited=$((waited + 15))
    health=$(curl -fsS --max-time 5 "${URL}/healthz" 2>/dev/null || echo '{"games":0}')
  done
fi

echo "==> Deploying ${APP} to Fly.io (single Machine)"
flyctl deploy --config fly.toml --app "${APP}" --remote-only --ha=false

echo "==> Waiting for health check at ${URL}/healthz"
for _ in $(seq 1 20); do
  if curl -fsS --max-time 5 "${URL}/healthz"; then
    echo
    echo "==> Caravan is up: ${URL}"
    exit 0
  fi
  sleep 3
done

echo "!! Caravan did not become healthy at ${URL}/healthz" >&2
exit 1
