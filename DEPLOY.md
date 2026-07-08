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
> them. The box's git checkout provides the manifests (`app/compose.prod.yaml`, `deploy/`), the
> gitignored `app/.env.prod` (prod secrets), and the control-plane image runs the deploy.
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
4. **Create `app/.env.prod`** from the example (it's gitignored, so a fresh checkout has none).
   > **⚠ THE prod secrets file is `app/.env.prod` — NOT `app/.env`, and NOT a repo-root `.env`/`.env.prod`.**
   > `make deploy` runs `forge deploy … --env-file app/.env.prod` (explicit), and the raw-compose
   > helpers (`make deploy-config/ps/logs/down`) name the same file — so `app/.env.prod` is the single,
   > unambiguous source of every prod secret. It's the same name the example (`app/.env.prod.example`)
   > and the compose `${POSTGRES_PASSWORD:?…set…in .env.prod}` hint use. A repo-root `.env` is the *dev
   > control-plane's* (`FORGE_PORT`/`FORGE_IMAGE`) and is **not** read by the prod stack.
   ```bash
   cp app/.env.prod.example app/.env.prod && chmod 600 app/.env.prod
   ```
   > **⚠ Already have a plain `app/.env` on this box (pre-`0.15.1`)? MIGRATE IT — this is the SMTP trap.**
   > Before the explicit `--env-file`, a plain `forge deploy` had **no** `--env-file` when `app/.env.prod`
   > was absent, so Compose fell back to its default — **`app/.env`** (resolved in the `app/` dir). The
   > deploy *looked* healthy (Google sign-in worked — those creds were in `app/.env`) while every var you
   > added to `app/.env.prod` per PROVISIONING.md was **silently ignored** — the file the deploy read
   > wasn't the file the docs told you to edit. That's exactly how SMTP stayed off (`configured.email:false`).
   > Fix it once, so there's one file:
   > ```bash
   > cp app/.env app/.env.prod          # carry EVERY existing secret over (Google, POSTGRES_PASSWORD, …)
   > # then add the SMTP vars to app/.env.prod:
   > #   SMTP_URL=smtp://USER:PASSWORD@HOST:PORT   (URL-encode reserved chars — e.g. '@' in the user → %40)
   > #   EMAIL_FROM=Your Name <no-reply@your-domain>
   > chmod 600 app/.env.prod
   > rm app/.env                         # remove the stale file so nothing can read it by accident
   > ```
   > Then redeploy (`./release/deploy.sh` or `make deploy` on the box) and re-check
   > `curl -s https://forge-os.mardash.ai/auth/config` → `"email":true`. Because `make deploy` now passes
   > `--env-file app/.env.prod` explicitly, a **missing** `app/.env.prod` is now a loud error, not a
   > silent fallback.
   Then fill it in. `POSTGRES_PASSWORD` is the only **hard-required** var — the compose uses
   `${POSTGRES_PASSWORD:?…}`, so an unset value fails `forge deploy` at interpolation *before any
   container starts*. The rest are optional but the app degrades without them: empty
   `AUTH_SESSION_SECRET` ⇒ **no login**; empty `ANTHROPIC_API_KEY` ⇒ AI drafting 503s. Generate the
   auth/service secrets with `openssl`:
   ```bash
   POSTGRES_PASSWORD=<a real password — must MATCH the postgres_data volume; see note below>
   AUTH_SESSION_SECRET=$(openssl rand -hex 32)   # HMAC key for the login session — keep STABLE
   AUTH_SERVICE_TOKEN=$(openssl rand -hex 32)    # gates the /api/cron/* service endpoints — STABLE
   GOOGLE_CLIENT_ID=<from your Google Cloud OAuth client>     # for Google sign-in
   GOOGLE_CLIENT_SECRET=<from your Google Cloud OAuth client>
   ANTHROPIC_API_KEY=<your key, or empty>
   FORGE_SECRETS_KEY=<a strong, STABLE value — see notes AND "Known gaps" below>
   # Image digests are baked into app/compose.prod.yaml by `forge productionize` (no
   # APP_IMAGE/FORGE_DATA_PLANE_IMAGE here). FORGE_IMAGE — the CONTROL PLANE for `make deploy` — is
   # a separate concern; it defaults in compose.yaml, set it only to pin a different control plane.
   ```
   `AUTH_SESSION_SECRET`/`AUTH_SERVICE_TOKEN` must be **stable** (rotating the session secret logs
   everyone out) and are each shared by `web` and `data-plane` — the compose wires both from the one
   var. **`POSTGRES_PASSWORD` must match** what the `postgres_data` volume was first initialized with
   (Postgres ignores it on an existing volume, so a *changed* value makes `web` fail auth `28P01`).
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
| `make deploy` | start the control plane (idempotent) → **`forge deploy … --env-file app/.env.prod`** (C7): reconcile `postgres`/`data-plane` in place, then a **zero-downtime start-first roll of `web`** → `ps`. `release/deploy.sh` runs `git pull --ff-only` first, so this deploys the current checkout. The explicit `--env-file` means the single prod secrets file is **`app/.env.prod`** — no silent fallback to `app/.env`. |
| `make deploy-ps` | container status |
| `make deploy-logs` | tail all logs |
| `make deploy-config` | validate `app/compose.prod.yaml` + `app/.env.prod` interpolation (no changes) |
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

## Platform papercuts — FIXED upstream in forge 0.15.1 (P10 + P11)

Two generic traps cost real time bringing the authenticated build live during the C10 auth cutover;
both were platform-side, not app bugs, and both are now **fixed in forge `0.15.1`** (this repo now
runs on `0.17.0`, which carries the fix). Kept here as the record — the next person (and forge-starter)
inherits the fix:

1. **Env-file name/location mismatch — FIXED (P10).** `forge productionize` emits the template as
   `app/.env.prod.example` and the generated compose's `${POSTGRES_PASSWORD:?…}` hint says *"set … in
   .env.prod"*, but `forge deploy` used to run `docker compose -f app/compose.prod.yaml` with **no
   `--env-file`** — so Compose only read **`app/.env`** and secrets in `app/.env.prod` were silently
   ignored. **forge `0.15.1` makes `forge deploy` default `--env-file` to `app/.env.prod`** (passed
   only when the file exists; overridable), so the example name, the compose hint, and the deploy
   default now **all agree on `app/.env.prod`** and a plain `forge deploy` loads your prod secrets.
   (Confirm: `./forge deploy --help` shows `--env-file … (default: "app/.env.prod")`.)
   > **Residual operator-side trap (the "only when the file exists" clause).** The fix removed the
   > mismatch for a *fresh* box, but there's still a gap on a box that predates it: because forge's
   > default `--env-file` is passed **only when `app/.env.prod` exists**, a box that still carries a
   > plain **`app/.env`** (and no `app/.env.prod`) makes `forge deploy` fall back to Compose's default
   > (`app/.env`) — so it deploys, Google works, and every edit you make to `app/.env.prod` (per
   > PROVISIONING.md) does nothing because that file isn't the one being read. This is exactly what hid
   > SMTP (`configured.email:false` with Google up). **This repo now closes it app-side:** `make deploy`
   > passes `--env-file app/.env.prod` **explicitly**, so a missing file is a loud error, not a silent
   > fallback — and step 4 above tells you to migrate `cp app/.env app/.env.prod`. *(Platform note: the
   > silent compose-default fallback when the explicit `--env-file` target is absent is a forge-side
   > papercut — forge could error, or warn, when `app/.env.prod` is missing but a plain `app/.env` is
   > present, rather than quietly reading the wrong file.)*
2. **`next.config.mjs` rewrites baked at BUILD time — FIXED (P11).** The C10 auth adoption proxied
   `/auth/*` to the data-plane via `rewrites()` reading `process.env.FORGE_DATA_PLANE_URL` behind an
   `if (!url) return []` guard. That var is only set at **runtime** (compose), so the CI image build
   compiled the rewrite away → `/auth/login` 404'd. This app already hand-worked-around it (default the
   destination to the in-cluster `http://data-plane:3718` and **always** emit the rewrite; a runtime
   var still overrides under `next dev`) — and forge `0.15.1` makes exactly that the **canonical
   generated `next.config.mjs`** (generator + `init` scaffold), so new apps inherit it and never re-hit
   the trap. Verified here: a clean image build with no `FORGE_DATA_PLANE_URL` still bakes the
   `/auth/:path*` → `http://data-plane:3718` rule into `.next/routes-manifest.json`.
