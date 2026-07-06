# Deploying forge-os

The production stack is **three containers** — no control plane, no `./forge`, no build
tooling:

```
web (app)  ──►  postgres          the Next.js standalone app + its database
   ▲
   │ callbacks (/api/cron/…)
data-plane (Forge sidecar)         scheduler (C2) + secrets store (C5), slim image
```

This is the **data-plane** half of the split — see the diagrams in the Forge repo
(`docs/diagrams/`). Build/test/lint and the `./forge` CLI are dev-only and are **absent** here.

> **You do not build on the host.** CI builds and publishes the images; the host just pulls and
> runs them. "Pulling forge-os code" only gets you the deploy manifests (`compose.prod.yaml`,
> `deploy/`) + your `.env` — the app itself is baked into `forge-os-app`.

## Images (built by CI)

| Image | Source | Built by |
|---|---|---|
| `ghcr.io/mardash-ai/forge-os-app` | this repo's [`app/Dockerfile`](app/Dockerfile) (Next.js standalone) | [`.github/workflows/publish-app.yml`](.github/workflows/publish-app.yml) |
| `ghcr.io/mardash-ai/forge-data-plane` | the Forge platform repo (`Dockerfile.data-plane`) | Forge's `publish-data-plane` workflow |

Both publish **continuously**: every push to `main` → `:latest` + `:sha-<short>`; a version
tag → `:X.Y.Z`. Both are multi-arch (`amd64` + `arm64`).

## Prerequisites (on the deploy host)

Only **Docker + the Compose plugin**. No Node, no `gh`, no `./forge`. The images are in a
private GHCR package, so log in once with a token that has `read:packages`:

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u <your-gh-user> --password-stdin
```

## One-time setup

```bash
git clone git@github.com:mardash-ai/forge-os.git && cd forge-os
cp .env.prod.example .env
```

Then edit `.env`:

```bash
# Pin DIGESTS, not :latest — reproducible + rollbackable (R1):
APP_IMAGE=ghcr.io/mardash-ai/forge-os-app@sha256:<digest>
FORGE_DATA_PLANE_IMAGE=ghcr.io/mardash-ai/forge-data-plane@sha256:<digest>

POSTGRES_PASSWORD=<a real password>
ANTHROPIC_API_KEY=<your key, or empty to run without AI drafting>
FORGE_SECRETS_KEY=<a strong, STABLE value — see notes>
```

Find the current digests with `docker buildx imagetools inspect ghcr.io/mardash-ai/<image>:latest`.

## Deploy / update

One command — pulls the pinned images and rolls the stack (unchanged services stay up):

```bash
make deploy
curl -sf http://localhost:3000/api/health     # web is up
```

`make deploy` is just `docker compose -f compose.prod.yaml pull && up -d && ps`. Re-run it for
every release (bump the digests in `.env` first). Convenience targets:

| Command | What it does |
|---|---|
| `make deploy` | pull pinned images + `up -d` + `ps` (the deploy/update command) |
| `make deploy-ps` | show container status |
| `make deploy-logs` | tail all logs |
| `make deploy-config` | validate `compose.prod.yaml` + `.env` without changing anything |
| `make deploy-down` | stop the stack, **keep** the data volumes |

## Rollback

Set the previous digest(s) in `.env` and re-run `make deploy`. Because digests are pinned,
rollback is deterministic.

## Notes that bite in real prod

- **`FORGE_SECRETS_KEY` must be stable and durable.** It decrypts the data-plane's secret vault
  (in the `forge_state` volume). Change it and stored secrets become unreadable. Keep it in your
  secret manager, never committed.
- **No migration step.** The app creates tables lazily (`CREATE TABLE IF NOT EXISTS` on first
  query), so there's nothing to run — but that also means **back up the `postgres_data` volume**
  yourself.
- **Data lives in named volumes** (`postgres_data`, `forge_state`). `make deploy-down` keeps them;
  never `docker compose ... down -v` in prod — that destroys the database.
- **TLS / domain.** The stack exposes `web` on `:3000` in the clear. Put a reverse proxy
  (Caddy / Traefik / nginx) in front for HTTPS + your domain — not included here.
- **Scheduled jobs.** The data-plane registers jobs from [`deploy/jobs.json`](deploy/jobs.json)
  at boot and calls `http://web:3000<target>` on cadence. It ships **empty**; add entries once the
  app exposes the matching cron endpoints (see [`deploy/jobs.example.json`](deploy/jobs.example.json)).
  This is what makes the C2 refactor real — recurring work that fires with no user present.
- The data-plane reaches the app via `FORGE_APP_CALLBACK_HOST` / `FORGE_APP_CALLBACK_PORT` — it
  needs **no** provisioned Forge state (unlike dev). Its own port (`3718`) is internal only.

## What's not automated (by design)

The pipeline stops at **publishing images**; getting them onto the host + `make deploy` is a
manual (or scripted) step. To close it into real CD, add a GitHub Actions job that SSHes to the
host and runs `make deploy` on each release, or a pull-based agent — ask and it can be wired up.
