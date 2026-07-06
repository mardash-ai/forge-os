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

## Images (built by CI)

| Image | Source | Built by |
|---|---|---|
| `ghcr.io/mardash-ai/forge-os-app` | this repo's [`app/Dockerfile`](app/Dockerfile) (Next.js standalone) | [`.github/workflows/publish-app.yml`](.github/workflows/publish-app.yml) |
| `ghcr.io/mardash-ai/forge-data-plane` | the Forge platform repo (`Dockerfile.data-plane`) | Forge's `publish-data-plane` workflow |

Both publish **continuously**: every push to `main` → `:latest` + `:sha-<short>`; a version
tag → `:X.Y.Z`. Both are multi-arch (`amd64` + `arm64`).

## Run it

```bash
cp .env.prod.example .env          # then edit: pin image digests, set secrets
docker compose -f compose.prod.yaml up -d
curl -sf http://localhost:3000/api/health     # web is up
```

- **Pin by digest (R1).** For a reproducible deploy set `APP_IMAGE` / `FORGE_DATA_PLANE_IMAGE`
  in `.env` to `…@sha256:<digest>`, not `:latest`.
- **Secrets.** `ANTHROPIC_API_KEY` is delivered at deploy time via env (empty → AI drafting
  returns 503, app stays up). `FORGE_SECRETS_KEY` is the master key for the data-plane's
  encrypted secret store — set a real value. In a real environment, source both from your
  platform's secret manager rather than a literal `.env`.
- **Scheduled jobs.** The data-plane registers jobs from [`deploy/jobs.json`](deploy/jobs.json)
  at boot and calls `http://web:3000<target>` on cadence. It ships **empty**; add entries once
  the app exposes the matching cron endpoints (see [`deploy/jobs.example.json`](deploy/jobs.example.json)).
  This is what makes the C2 refactor real — recurring work that fires with no user present.

## Notes

- The data-plane sidecar reaches the app at `web:3000` over the compose network via
  `FORGE_APP_CALLBACK_HOST` / `FORGE_APP_CALLBACK_PORT` — it needs **no** provisioned Forge
  state (unlike dev, where `./forge provision` sets it up).
- The sidecar's own port (`3718`) is internal only.
- `data-plane` and `postgres` state live in named volumes (`forge_state`, `postgres_data`).
