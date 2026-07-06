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

> **Keychain gotcha (Docker Desktop on macOS box).** A private-image `pull` over SSH can fail with
> *"keychain cannot be accessed … the keychain may be locked"* — the SSH session can't unlock the
> login keychain. Fix once from an interactive shell: `./release/box-shell.sh`, then
> `security unlock-keychain ~/Library/Keychains/login.keychain-db` and
> `docker compose -f compose.prod.yaml pull`. Cached images then redeploy fine.

## `make deploy` (what runs on the box)

`release/deploy.sh` invokes this; you can also run it directly on the box:

| Command | What it does |
|---|---|
| `make deploy` | `git pull --ff-only` → pull pinned images → `up -d` → `ps` (the deploy/update command) |
| `make deploy-ps` | container status |
| `make deploy-logs` | tail all logs |
| `make deploy-config` | validate `compose.prod.yaml` + `.env` (no changes) |
| `make deploy-down` | stop the stack, **keep** the data volumes |

## Rollback

Set the previous digest(s) in `.env` on the box and re-run `make deploy` (or `./release/deploy.sh`).
Pinned digests make rollback deterministic.

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
