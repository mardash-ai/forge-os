#!/usr/bin/env bash
# Zero-downtime rolling deploy of the Traefik-fronted `web` service.
#
# `docker compose up -d` recreates a single-replica service STOP-FIRST: it stops the old
# container before the new one is serving, so Traefik briefly has no backend for
# forge-os.mardash.ai → a few seconds of 502s. This rolls START-FIRST instead:
#
#   1. bring up a SECOND `web` on the new image, alongside the old (both join `proxy`, so
#      Traefik load-balances across them — and, via the loadbalancer.healthcheck labels in
#      compose.prod.yaml, only routes to a replica once it passes /api/health);
#   2. wait until the new replica is healthy;
#   3. drain + remove the old replica (SIGTERM, up to stop_grace_period).
#
# There is never zero healthy backends, so no request 502s. If the new replica never becomes
# healthy, the old one is left serving and this fails loudly — a safe, automatic rollback.
#
# Runs ON THE BOX (invoked by `make deploy`). Written for macOS's stock bash 3.2.
set -euo pipefail

PROD="docker compose -f compose.prod.yaml"
SVC="web"
TIMEOUT="${ROLLOUT_TIMEOUT:-120}"   # seconds to wait for the new replica to become healthy
PROXY_NET="${PROXY_NET:-proxy}"     # external Traefik network (compose.prod.yaml: networks.proxy)

before="$($PROD ps -q "$SVC" || true)"
count="$(echo $before | wc -w | tr -d ' ')"

if [ "${count:-0}" -eq 0 ]; then
  echo "→ no running $SVC container — starting one (first deploy, nothing to roll)."
  $PROD up -d "$SVC"
  exit 0
fi

echo "→ rolling $SVC (currently $count running): starting a new replica alongside the old…"
$PROD up -d --no-deps --no-recreate --scale "$SVC=$((count + 1))" "$SVC"

# The new replica = whatever is running now that wasn't running before.
after="$($PROD ps -q "$SVC")"
new=""
for id in $after; do
  found=0
  for o in $before; do [ "$id" = "$o" ] && found=1 && break; done
  [ "$found" -eq 0 ] && new="$new $id"
done
new="$(echo $new)"   # trim surrounding whitespace

if [ -z "$new" ]; then
  echo "✗ could not identify the new $SVC replica after scale-up." >&2
  exit 1
fi
echo "  new replica: $new"

# Wait for the new replica to report healthy (Docker healthcheck in compose.prod.yaml).
deadline="$(( $(date +%s) + TIMEOUT ))"
for id in $new; do
  printf "  waiting for %s to become healthy" "$(echo "$id" | cut -c1-12)"
  while :; do
    st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || echo gone)"
    [ "$st" = "healthy" ] && { echo " ✓"; break; }
    [ "$st" = "none" ]    && { echo " ✓ (no healthcheck defined; assuming ready)"; break; }
    if [ "$(date +%s)" -ge "$deadline" ] || [ "$st" = "gone" ]; then
      echo " ✗ ($st)"
      echo "✗ new $SVC replica never became healthy — removing it, keeping the old one serving." >&2
      docker rm -f $new >/dev/null 2>&1 || true
      exit 1
    fi
    sleep 2
  done
done

# New replica is healthy and taking traffic. Now DRAIN the old replica(s) before killing them:
# disconnect each from the `proxy` network so Traefik deregisters it (stops routing NEW requests
# to it) while the new replica keeps serving, pause for any in-flight request to finish, THEN
# stop + remove. Without this deregister-first step a request can land on the old replica in the
# very instant it's removed and hang until it times out — the one residual gap after start-first.
echo "→ new replica healthy; draining old container(s) out of Traefik…"
for id in $before; do
  docker network disconnect "$PROXY_NET" "$id" >/dev/null 2>&1 || true
done
sleep "${ROLLOUT_DRAIN:-3}"   # let Traefik deregister + in-flight requests settle
echo "→ removing old container(s)…"
for id in $before; do
  docker stop "$id" >/dev/null 2>&1 || true
  docker rm   "$id" >/dev/null 2>&1 || true
done

echo "✓ zero-downtime roll complete — $SVC now serving on the new image."
