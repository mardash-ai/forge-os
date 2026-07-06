# Deploying forge-os

Production is **three containers** behind the shared **proxygen / Traefik** proxy, served at
**https://forge-os.mardash.ai** — no control plane, no `./forge`, no build tooling:

```
                     Traefik (proxy network, TLS)
                          │  https://forge-os.mardash.ai
                          ▼
web (app)  ──►  postgres              Next.js standalone app + its database  (internal network)
   ▲
   │ callbacks (/api/cron/…)
data-plane (Forge sidecar)            scheduler (C2) + secrets store (C5), slim image
```

This is the **data-plane** half of the split — see the diagrams in the Forge repo
(`docs/diagrams/`). Build/test/lint and the `./forge` CLI are dev-only and **absent** here.

> **You don't build on the host.** CI builds and publishes the images; the box just pulls and runs
> them. The box's git checkout only provides the manifests (`compose.prod.yaml`, `deploy/`) + `.env`.

## Deploy in one command (from your laptop)

```bash
./release/deploy.sh              # remote box (default); SSHes in and runs `make deploy`
./release/deploy.sh --host local # over the LAN instead
./release/deploy.sh --force      # deploy last pushed commit even if the local repo is dirty
```

`release/deploy.sh` runs a **pre-flight gate** (the box only ships *pushed* commits, so it refuses
if this repo has uncommitted/unpushed changes — commit & push first, or `--force`), then SSHes to
the box and runs `make deploy` in `~/projects/forge-os`. Verify: `curl -sf https://forge-os.mardash.ai/api/health`.

> `release/` is **gitignored** — `serverconn.sh` holds an SSH key passphrase, so it must never land
> in this public repo. It's operator-local (copied from `shared/release/`). `release/box-shell.sh`
> opens an interactive shell on the box for debugging.

## Images (built by CI)

| Image | Source | Built by |
|---|---|---|
| `ghcr.io/mardash-ai/forge-os-app` | this repo's [`app/Dockerfile`](app/Dockerfile) (Next.js standalone) | [`.github/workflows/publish-app.yml`](.github/workflows/publish-app.yml) |
| `ghcr.io/mardash-ai/forge-data-plane` | the Forge platform repo (`Dockerfile.data-plane`) | Forge's `publish-data-plane` workflow |

Both publish **continuously** (push to `main` → `:latest` + `:sha-<short>`; a tag → `:X.Y.Z`),
multi-arch (`amd64` + `arm64`).

## First-time setup on the box (once per box)

`deploy.sh` assumes the box is already set up. Bringing forge-os up the first time:

1. **Clone** to `~/projects/forge-os` on the box (it's its own git repo).
2. **`proxy` network exists.** The web app joins the external `proxy` network created by the
   **proxygen** stack — start that first (`~/projects/proxygen` → `make up`), or `up` fails
   *"network proxy not found"*.
3. **Log in to GHCR** (images are private):
   ```bash
   echo "$GHCR_PAT" | docker login ghcr.io -u <your-gh-user> --password-stdin   # PAT needs read:packages
   ```
4. **Create `.env`** from the example (it's gitignored, so a fresh checkout has none):
   ```bash
   cp .env.prod.example .env && chmod 600 .env
   ```
   Then pin digests + set secrets:
   ```bash
   APP_IMAGE=ghcr.io/mardash-ai/forge-os-app@sha256:<digest>            # R1: pin, don't track :latest
   FORGE_DATA_PLANE_IMAGE=ghcr.io/mardash-ai/forge-data-plane@sha256:<digest>
   POSTGRES_PASSWORD=<a real password>
   ANTHROPIC_API_KEY=<your key, or empty>
   FORGE_SECRETS_KEY=<a strong, STABLE value — see notes>
   ```
   Find digests: `docker buildx imagetools inspect ghcr.io/mardash-ai/<image>:latest`.
5. **DNS:** `forge-os.mardash.ai` must point at the box (Traefik already serves `*.mardash.ai`).
6. **Deploy:** `./release/deploy.sh` from your laptop (or `make deploy` on the box).

> **Keychain gotcha (Docker Desktop on macOS box).** Even with **public** packages, Docker Desktop
> always consults its credential keychain, which an SSH session can't unlock → `docker compose pull`
> fails with *"keychain cannot be accessed …"*. `make deploy` treats the pull as **non-fatal** and
> deploys the **already-cached** images, so config/code changes ship hands-free. To land a **new
> image**, unlock + pull once interactively: `./release/box-shell.sh`, then
> `security -v unlock-keychain ~/Library/Keychains/login.keychain-db` and
> `docker compose -f compose.prod.yaml pull`, then re-deploy.

## `make deploy` (what runs on the box)

`release/deploy.sh` invokes this; you can also run it directly on the box:

| Command | What it does |
|---|---|
| `make deploy` | pull images (**non-fatal** — see keychain note) → reconcile `postgres` → **zero-downtime roll of `web`** ([`deploy/rollout.sh`](deploy/rollout.sh)) → reconcile `data-plane` → `ps`. `release/deploy.sh` runs `git pull --ff-only` first, so this deploys the current checkout. |
| `make deploy-ps` | container status |
| `make deploy-logs` | tail all logs |
| `make deploy-config` | validate `compose.prod.yaml` + `.env` (no changes) |
| `make deploy-down` | stop the stack, **keep** the data volumes |

## Zero-downtime deploys

`web` is rolled **start-first** so `forge-os.mardash.ai` never loses its backend. A plain
`docker compose up -d` recreates a single-replica service *stop-first* (stop old → start new), and
during that gap Traefik has no healthy backend → a few seconds of 502s. Instead [`deploy/rollout.sh`](deploy/rollout.sh):

1. brings up a **second `web`** on the new image alongside the old (both join `proxy`, so Traefik
   load-balances across them — and, via the `loadbalancer.healthcheck` labels in
   [`compose.prod.yaml`](compose.prod.yaml), only routes to a replica once it passes `/api/health`);
2. waits until the new replica is **healthy** (Docker healthcheck);
3. drains + removes the old replica (SIGTERM, up to `stop_grace_period: 15s`).

There is always ≥1 healthy backend, so no request 502s. If the new replica never becomes healthy
the old one is left serving and the deploy **fails loudly** — an automatic, safe rollback. Only
`web` is rolled; `postgres` reconciles in place (a schema/image change there is a separate, rare
concern), and the `data-plane` sidecar isn't public-facing.

> Verify a roll had zero downtime: run a probe against the public URL *during* a deploy —
> `while :; do curl -sf -o /dev/null https://forge-os.mardash.ai/api/health && printf . || printf X; sleep 0.2; done`
> — every mark should be a `.` (success); an `X` is a dropped request.

## Rollback

Set the previous digest(s) in `.env` on the box and re-run `make deploy` (or `./release/deploy.sh`).
Pinned digests make rollback deterministic. (The roll itself also auto-rolls-back: a new replica
that never gets healthy is discarded and the old one keeps serving.)

## Notes that bite in real prod

- **Traefik ingress, no host port.** `web` joins `proxy` and Traefik routes `forge-os.mardash.ai`
  → the container (`loadbalancer.server.port=3000`, `traefik.docker.network=proxy`). The app image
  already sets `ENV HOSTNAME=0.0.0.0` (else Traefik 502) and ships a `public/` dir.
- **`FORGE_SECRETS_KEY` must be stable and durable.** It decrypts the data-plane's secret vault (in
  the `forge_state` volume). Change it and stored secrets become unreadable — keep it in a secret
  manager, never committed.
- **No migration step.** The app creates tables lazily (`CREATE TABLE IF NOT EXISTS`), so there's
  nothing to run — but **back up the `postgres_data` volume** yourself.
- **Data lives in named volumes** (`postgres_data`, `forge_state`). `make deploy-down` keeps them;
  never `down -v` in prod — that destroys the database.
- **Scheduled jobs.** The data-plane registers jobs from [`deploy/jobs.json`](deploy/jobs.json) at
  boot and calls `http://web:3000<target>` on cadence. It ships **empty**; add entries once the app
  exposes the matching cron endpoints (see [`deploy/jobs.example.json`](deploy/jobs.example.json)) —
  that's what makes the C2 refactor real (work that fires with no user present).
