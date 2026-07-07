# Deploying forge-os

Production is **three runtime containers** behind the shared **proxygen / Traefik** proxy, served at
**https://forge-os.mardash.ai**. The app runtime carries no control plane and no build tooling;
**deploys** start a Forge control plane *transiently* to run `forge deploy` (the C7 Deploy
capability), which rolls the stack over the Docker socket — then it's idle again:

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
(`docs/diagrams/`). Build/test/lint never run here; the control plane is used only to *orchestrate*
the deploy (the start-first roll), never to build.

> **You don't build on the host.** CI builds and publishes the images; the box just pulls and runs
> them. The box's git checkout provides the manifests (`app/compose.prod.yaml`, `deploy/`) + `.env`, and
> the control-plane image runs the deploy.
>
> **The prod stack is GENERATED now (C8 · productionize).** `app/compose.prod.yaml`, `app/Dockerfile`,
> `app/.dockerignore`, and `app/.env.prod.example` are emitted by `forge productionize` — do not
> hand-edit them; re-run `forge productionize --app forge-os --web-image <ref@sha256:…>
> --data-plane-image <ref@sha256:…>` to change images/host. The web + data-plane images are now
> **baked as literal digests** in the generated compose (not `${APP_IMAGE}`/`${FORGE_DATA_PLANE_IMAGE}`
> env indirection). See "Known gaps" at the bottom before a real prod cutover.

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
   cp app/.env.prod.example .env && chmod 600 .env
   ```
   Then set secrets (the web + data-plane image digests are already baked into
   `app/compose.prod.yaml` by `forge productionize` — no `APP_IMAGE`/`FORGE_DATA_PLANE_IMAGE` here):
   ```bash
   POSTGRES_PASSWORD=<a real password>
   ANTHROPIC_API_KEY=<your key, or empty>
   FORGE_SECRETS_KEY=<a strong, STABLE value — see notes AND "Known gaps" below>
   # FORGE_IMAGE (control-plane) is optional — it defaults to 0.12.0 in compose.yaml;
   # override only to pin a different control-plane image for `make deploy`.
   ```
   To change the deployed image digests, re-run `forge productionize` (do NOT hand-edit the compose).
5. **DNS:** `forge-os.mardash.ai` must point at the box (Traefik already serves `*.mardash.ai`).
6. **Deploy:** `./release/deploy.sh` from your laptop (or `make deploy` on the box).

> **Keychain gotcha (Docker Desktop on macOS box).** Even with **public** packages, Docker Desktop
> always consults its credential keychain, which an SSH session can't unlock → `docker compose pull`
> fails with *"keychain cannot be accessed …"*. `make deploy` treats the pull as **non-fatal** and
> deploys the **already-cached** images, so config/code changes ship hands-free. To land a **new
> image**, unlock + pull once interactively: `./release/box-shell.sh`, then
> `security -v unlock-keychain ~/Library/Keychains/login.keychain-db` and
> `docker compose -f app/compose.prod.yaml pull`, then re-deploy. The **control-plane image**
> (`FORGE_IMAGE`, started by `make deploy` → `make up` to run `forge deploy`) has the same gotcha —
> pull it once the same way (`docker compose pull` in the repo root) so `make up` finds it cached.

## `make deploy` (what runs on the box)

`release/deploy.sh` invokes this; you can also run it directly on the box:

| Command | What it does |
|---|---|
| `make deploy` | start the control plane (idempotent) → **`forge deploy`** (C7): reconcile `postgres`/`data-plane` in place, then a **zero-downtime start-first roll of `web`** → `ps`. `release/deploy.sh` runs `git pull --ff-only` first, so this deploys the current checkout. |
| `make deploy-ps` | container status |
| `make deploy-logs` | tail all logs |
| `make deploy-config` | validate `app/compose.prod.yaml` + `.env` (no changes) |
| `make deploy-down` | stop the stack, **keep** the data volumes |

## Zero-downtime deploys — the Forge `Deploy` capability (C7)

Zero-downtime is a **platform capability** now, not a script in this repo. `forge deploy` rolls the
public `web` service **start-first** so `forge-os.mardash.ai` never loses its backend (a plain
`docker compose up -d` recreates a single replica *stop-first*, leaving Traefik with no backend for
a few seconds → 502s). It:

1. reconciles the non-public services (`postgres`, `data-plane`) in place;
2. brings up a **second `web`** on the new image alongside the old (both join `proxy`, so Traefik
   load-balances across them — and, via the `loadbalancer.healthcheck` labels in
   [`app/compose.prod.yaml`](app/compose.prod.yaml), only routes to a replica once it passes `/api/health`);
3. waits until the new replica is **healthy**, then drains it out of `proxy` and removes it
   (SIGTERM, up to `stop_grace_period: 15s`).

There is always ≥1 healthy backend, so no request 502s. If the new replica never becomes healthy it
is discarded and the old one keeps serving — an automatic, safe rollback (a `DeploymentRolledBack`
fact). Each roll is recorded as a `Deployment` resource; see it with `./forge inspect events`.

> Verify a roll had zero downtime: run a probe against the public URL *during* a deploy —
> `while :; do curl -sf -o /dev/null https://forge-os.mardash.ai/api/health && printf . || printf X; sleep 0.2; done`
> — every mark should be a `.` (success); an `X` is a dropped request. (This is exactly how the
> capability was proven — 0 dropped requests across the roll.)

## Rollback

Re-run `forge productionize` with the **previous** `--web-image`/`--data-plane-image` digests (the
generated `app/compose.prod.yaml` bakes them in — they're no longer `.env` overrides), then re-run
`make deploy` (or `./release/deploy.sh`). Pinned digests make rollback deterministic. (The roll
itself also auto-rolls-back: a new replica that never gets healthy is discarded and the old one keeps
serving.)

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
- **Scheduled jobs (C2).** The data-plane registers jobs from a mounted jobs file and calls
  `http://web:3000<target>` on cadence. `app/forge.jobs.json` (declaring `habits-finalize`,
  `cron 5 0 * * *` → `/api/cron/habits-finalize`) is present, so `forge productionize` (>=0.11.1)
  bind-mounts it `:ro` and pins `FORGE_JOBS_FILE=/app/forge.jobs.json` in the generated compose — the
  job registers on boot in prod. (`deploy/jobs.example.json` documents the schema.)

## Prod-correctness fixes landed in forge 0.11.1 (was: "Known gaps after C8")

The three gaps the first generated `app/compose.prod.yaml` had were **generator** bugs; forge `0.11.1`
fixed the generator, and re-running `forge productionize` regenerated the stack with all of them
closed. Dev-level verification (compose config, build/test/lint/tsc) is green; a full prod-deploy on
the box is still a **human-box** step (pending). What the fixed generator now emits:

1. **Data-plane base URL var name (P7.1) — resolved.** `web` now gets
   `FORGE_EVENTS_URL=http://data-plane:3718` (the var the app's C1/C3/C4 clients read), with
   `FORGE_DATA_PLANE_URL` kept as an alias.
2. **Secret vault for the data-plane (P6) — resolved.** The data-plane sidecar now gets
   `FORGE_SECRETS_KEY=${FORGE_SECRETS_KEY:-}` **and** each declared secret
   (`ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}`), so it can decrypt the C5 vault the agent runtime
   (C1) reads in prod — `agent-run` no longer 503s. Set `FORGE_SECRETS_KEY` in the deploy env.
3. **C2 jobs file mounted (P7.3) — resolved.** `app/forge.jobs.json` is bind-mounted `:ro` and
   `FORGE_JOBS_FILE=/app/forge.jobs.json` is pinned (see "Scheduled jobs" above).

Also: `forge deploy`'s `--compose-file` now **defaults** to `app/compose.prod.yaml` (P7.2), so
`make deploy` no longer passes it explicitly. Confirm the roll on the box.
