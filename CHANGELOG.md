# Changelog

All notable changes to **forge-os** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.12.2] — 2026-07-09

### Fixed

- **Responsive site nav — collapse to a tap-to-open menu on mobile.** The primary nav
  (`SiteNav`) rendered its full inline row (`Floor · Today · Habits · Log · Alerts` + the alert
  badge + the account tail) at every width, so on phones it ran past the right edge and the page
  scrolled sideways. Below the **768px** tablet breakpoint the row now collapses behind a single
  **"Menu"** toggle that reveals the same links as a bounded dropdown; tablet-and-up is unchanged.
  The links are wrapped in a thin client component (`NavMenu`) so `SiteNav` stays an async server
  component, and the dropdown is width-capped (`max-width: calc(100vw - 32px)`) so **nothing
  overflows the viewport at any width** (verified 320→1280px: no horizontal scroll; the inline row
  is intrinsically ~620px wide, which is why the breakpoint sits at 768px rather than a smaller one).
- **Keep the mobile nav accessible.** The toggle is a real `<button>` with an accessible label
  (`aria-label` "Open menu"/"Close menu"), `aria-expanded`, and `aria-controls` pointing at the
  dropdown; it is keyboard-operable and closes on a second press, on choosing a link, on `Escape`,
  or on a pointer press outside the nav.

## [0.12.1] — 2026-07-09

### Changed

- **Repin the prod `web` image to the CI build of `0.12.0` (footer + forge `0.22.0` adoption).**
  Re-run `forge productionize` with `--web-image ghcr.io/mardash-ai/forge-os-app@sha256:9427e4da…`
  (the multi-arch image CI published for the `0.12.0` app-code commit — it carries the site-wide
  footer) while keeping the data-plane at `forge-data-plane:0.22.0@sha256:9de9a8a0…`. Updates
  `app/compose.prod.yaml` + `app/forge.app.json` so `forge deploy`'s drift gate lands both tiers on
  their pins. Re-apply the hand-added C15 uptime sampler env + the P13 `app/.env.prod` migration note
  that a productionize regeneration drops.

## [0.12.0] — 2026-07-09

### Added

- **Enable the C15 uptime sampler (`FORGE_STATUS_SAMPLE`).** Turn on the data-plane's periodic C6
  health sampler in the production stack (`FORGE_STATUS_SAMPLE=1`, `FORGE_STATUS_SAMPLE_INTERVAL=5m`
  on the `data-plane` service in `app/compose.prod.yaml`) so `/status.json` gains a rolling `uptime`
  section once a sample tick runs. Overridable from `app/.env.prod`; defaults on. Hand-added to the
  generated stack — `forge productionize` does not emit it yet, so a future re-productionize will drop
  it until forge carries a sampler option (noted inline).

### Changed

- **Consume forge `0.22.0` (control + data-plane) — fail-loud session secret, `forge verify`, uptime
  sampler.** Bump `FORGE_IMAGE` → `forge-control-plane:0.22.0@sha256:e790de7d…` (dev `compose.yaml`)
  and the data-plane → `forge-data-plane:0.22.0@sha256:9de9a8a0…` (dev `app/compose.yaml` + prod
  `app/compose.prod.yaml` + `app/forge.app.json`), multi-arch (amd64+arm64), digest-pinned (R1). The
  `web` image is unchanged in this commit — the app-code footer rebuild is repinned in a follow-up
  once CI publishes it.
- **Re-run `forge productionize` on the `0.22.0` pin — the prod stack now FAILS LOUD on a missing
  session secret (P17).** Regenerates `app/compose.prod.yaml` so `AUTH_SESSION_SECRET` is
  `${AUTH_SESSION_SECRET:?…}` (required + non-empty) on both the `web` and `data-plane` services — a
  missing/empty session-signing key now aborts the deploy instead of silently rotating the key and
  logging every signed-in user out (the P17 logout-on-deploy failure mode). The durable `forge_state`
  + `postgres_data` volumes are preserved, so a deploy recreates containers without touching the
  auth/session store. Re-add the hand-authored P13 `app/.env.prod` migration note that productionize
  drops (`app/PROVISIONING.md`).

### Fixed

- **`./forge` wrapper — pass `--` before the CLI entry so option flags reach the CLI (P16).** Launch
  the in-container CLI as `tsx -- src/cli/index.ts "$@"` (was `tsx src/cli/index.ts "$@"`) so `tsx`
  stops option-parsing at `--` and forwards flags like `--env-file app/.env.prod` to the Forge CLI
  instead of swallowing them. Without this, `make deploy` aborted on the explicit `--env-file` before
  it could roll the production stack.

## [0.11.0] — 2026-07-09

### Added

- **App footer — the live app version + a platform attribution, site-wide.** Add a muted footer to
  the root layout (`app/app/components/Footer.tsx`, wired into `app/app/layout.tsx`) so every
  app-owned page ends with a quiet telemetry row in the forge-floor aesthetic (mono, `--ash`, aligned
  to the same 860px column as `.wrap`). It renders `v<X.Y.Z>` read **dynamically** from
  `app/package.json` via `app/lib/version.ts` (a static import Next inlines at build time — correct in
  the built/standalone app, never hardcoded, and it tracks every future `/commit-code` bump),
  followed by a **static** "Powered by Mardash Forge" attribution. The brand label is isolated in its
  own element (`.footer-brand`) as **link-ready markup**, so turning it into a link to the Mardash
  marketing site later is a one-line change (lifting the attribution to the platform is tracked as
  capability `C17`). Signed-out `/auth/*` pages are platform-served and out of scope. Spec:
  `specs/app-footer/`.

## [0.10.1] — 2026-07-08

### Changed

- **Consume forge `0.19.0` (control + data-plane) — a maintenance bump that self-verifies the deploy (P14).**
  Bump `FORGE_IMAGE` → `forge-control-plane:0.19.0@sha256:d57148a1…` (dev `compose.yaml`) and the
  data-plane → `forge-data-plane:0.19.0@sha256:b05af0b6…` (dev `app/compose.yaml` + prod
  `app/compose.prod.yaml` + `app/forge.app.json`), multi-arch (amd64+arm64), digest-pinned (R1). The
  `web` image is unchanged (no app-code change → no rebuild). `0.19.0` hardens the rollout: a **drift
  gate** fails loudly if a running image ≠ its pinned digest (or a pull left it absent — no more silent
  stale deploys), and it force-recreates digest-pinned sidecars + the control plane onto their pins, so
  `make deploy` now self-verifies.
- **Re-run `forge productionize` on the `0.19.0` data-plane pin.** Regenerates `app/compose.prod.yaml`
  with the new data-plane digest while keeping the `web` pin, the theme mount
  (`FORGE_THEME_FILE=/app/forge.theme.json`), and the C15 status-callback env (`FORGE_APP_CALLBACK_HOST`
  / `FORGE_APP_CALLBACK_PORT` / `FORGE_READINESS_PATH`). Re-adds the hand-added `app/.env.prod` migration
  note to `app/PROVISIONING.md` that productionize drops (P13).

### Removed

- **Drop the now-redundant `dark{}` block from `app/forge.theme.json` (C16 fix in forge `0.19.0`).** For
  a pinned `mode:"dark"`, forge `0.19.0` makes the base `colors{}` the **entire** dark palette (neutral
  surfaces included), so the `dark{}` block only mirrored `colors{}`. Removing it leaves the render
  **byte-identical** — proved before/after under the `0.19.0` data-plane: `/theme.css` still emits
  `--forge-color-bg:#16120e`, surface `#2a231d`, text `#efe7da` in dark mode.

## [0.10.0] — 2026-07-08

### Added

- **Production smoke suite (app-local first cut of C14).** A small, strictly **read-only /
  non-destructive** HTTP suite that validates the *deployed* app end-to-end, kept **out** of the
  hermetic offline unit run. New `app/tests/smoke/prod.smoke.ts` + `app/vitest.smoke.config.ts`
  (includes only `tests/smoke/**`) run via `npm run smoke:prod` (`vitest run -c
  vitest.smoke.config.ts`, host-run, needs outbound internet). Target host comes from **`SMOKE_URL`**
  (fallback `BASE_URL`), defaulting to `https://forge-os.mardash.ai`, so the same suite points at
  dev/staging. Every request is a fresh, cookie-less `fetch` with `redirect: 'manual'`. Assertions:
  `GET /api/health` → 200 public matching the C6 schema; `GET /` → `302` to `/auth/login?next=%2F`;
  `GET /auth/config` encodes the intended prod config (`email`/`google`/`session_key`/`service_token`
  configured, `password_signup` + `google` methods); `GET /auth/login` → 200 `text/html` with both
  methods (email+password fields and a `/auth/google` link); `/api/goals` + `/api/today` → `401`;
  `/api/cron/habits-finalize` → `403` (service-scoped, not 401); `POST /auth/refresh` → `401` (no side
  effect); `/status` → 200 public and `/status.json` reports a valid banner + a `db` component.
  Verified green against prod (8/8). No signups, writes, emails, DB/volume ops, or deploy — safe to
  re-run against prod repeatedly.

### Changed

- **Exclude `tests/smoke/**` from the hermetic unit run.** `app/vitest.config.ts` now excludes the
  smoke directory so the offline `./forge test` (87 tests) never pulls in the internet-dependent
  suite.

## [0.9.1] — 2026-07-08

### Fixed

- **Repin the prod web image to the 0.9.0 CI build so the deploy actually ships the C15/C16 adoption.**
  `make deploy` is pull-and-run on the literal digest in `app/compose.prod.yaml`, so the C15/C16
  `next.config.mjs` rewrites (`/status`, `/status.json`, `/theme.css`) only reach prod on a **fresh web
  image**. Re-runs `forge productionize` to pin `web` at `ghcr.io/mardash-ai/forge-os-app@sha256:0581377d…`
  (the CI build of `0.9.0` / commit `18df31a`, tag `:sha-18df31a`, confirmed `== :latest`), keeping the
  data-plane at `0.18.0@sha256:132a5ea8…`, so the next `make deploy` lands both tiers current in one roll
  (the pairing `DEPLOY.md` requires). Pin/config only — no app runtime change.

## [0.9.0] — 2026-07-08

### Added

- **Adopt C16 — brand the platform-served UI to match forge-os.** A root `app/forge.theme.json` (derived
  from the app's committed dark "forge floor" palette — slag/iron surfaces `#16120e`/`#2a231d`,
  forge-orange primary `#cb5320`, amber-heat accent `#e9a93c`, chalk/ash text, Instrument Sans, `6px`
  radius, an ember `logo`/`favicon`, and the app's ambient-heat radial glow as `custom_css`) repaints the
  hosted auth pages (`/auth/*`) and the status page in `--forge-*` tokens instead of the neutral default.
  Carries a `dark{}` block so the neutral surfaces resolve to forge-os's dark palette (the platform applies
  the base `colors{}` neutrals only in light mode; brand/semantic colors apply in both). `forge
  productionize` mounts it into the data-plane sidecar (`FORGE_THEME_FILE=/app/forge.theme.json`).
- **Adopt C15 — a public status page.** Proxy the data-plane's `/status` (themed HTML) + `/status.json`
  same-origin; both are **public** and aggregate the app's own C6 `/api/health` into an overall banner +
  per-component rows (web, db, data plane), so an outage is visible without signing in.

### Changed

- **Consume forge `0.18.0` (control + data-plane).** Bump `FORGE_IMAGE` →
  `forge-control-plane:0.18.0@sha256:5cbc0788…` (dev `compose.yaml`) and the data-plane →
  `forge-data-plane:0.18.0@sha256:132a5ea8…` (dev `app/compose.yaml` + prod `app/compose.prod.yaml` +
  `app/forge.app.json`), multi-arch (amd64+arm64), digest-pinned (R1).
- **Proxy `/status`, `/status.json`, `/theme.css` same-origin (`app/next.config.mjs`).** Same always-on
  rewrite pattern as `/auth/*` — defaulted to the in-cluster `http://data-plane:3718` and always emitted,
  so they survive `next build` with no build-time env (P11).
- **Open the gate for the public status surface (`app/middleware.ts`).** `/status` + `/status.json` join
  the public prefixes (`/theme.css` is already skipped by the static-asset matcher), so `/status` renders
  with no login redirect.
- **Regenerate the prod stack via `forge productionize`.** The data-plane sidecar now also gets the C15
  callback env (`FORGE_APP_CALLBACK_HOST=web` / `FORGE_APP_CALLBACK_PORT=3000` /
  `FORGE_READINESS_PATH=/api/health` — which also fixes prod C2 scheduler callbacks) and the C16 theme
  mount. Dev `app/compose.yaml` mirrors the theme + callback env so dev and prod behave identically.
  Re-adds the hand-added `app/.env.prod` migration note to `PROVISIONING.md` that productionize drops (P13).

## [0.8.3] — 2026-07-08

### Fixed

- **Repin the prod web image to the published 0.8.x refresh build so a deploy actually ships the refresh
  middleware.** `app/compose.prod.yaml` + `app/forge.app.json` still pinned the pre-refresh C10 web image
  (`…a553…`), which predates the **0.8.0 refresh middleware** (`app/middleware.ts` → `POST /auth/refresh`);
  a deploy on that pin ran the OLD app against the `0.17.0` data-plane (short-lived access tokens, no client
  refresh). Re-runs `forge productionize` to pin `web` at
  `ghcr.io/mardash-ai/forge-os-app@sha256:d24f3bc1…` — the current CI build of app HEAD (tag `:sha-721316a`,
  confirmed `== :latest`) — while keeping the data-plane at `0.17.0@sha256:465ae7cc…`, so the operator's next
  `make deploy` lands **both** tiers current in the same roll (the pairing `DEPLOY.md` / 0.8.2 require).
  Pin/config only — no app runtime change. Re-adds the hand-added `app/.env.prod` note to `PROVISIONING.md`
  that productionize drops.

## [0.8.2] — 2026-07-08

### Fixed

- **Document the two-part deploy so `git pull` + `make deploy` can't silently ship the OLD web build
  (`DEPLOY.md`).** `make deploy` is **pull-and-run**: it rolls `web` on the **literal digest** pinned in
  `app/compose.prod.yaml`, never a rebuild and never `:latest`. Shipping new app code therefore requires
  **first** repinning that digest — resolve the newest CI build's digest (`docker buildx imagetools
  inspect ghcr.io/mardash-ai/forge-os-app:latest --format '{{.Manifest.Digest}}'`) and re-run `forge
  productionize --web-image …@sha256:<new> --data-plane-image …0.17.0@sha256:465ae7cc…`, commit + push,
  **then** deploy. Records the incident this closes: the C10 `…a553…` web image was preserved across the
  forge-`0.15.1`/`0.17.0` adoptions, so the **0.8.0 refresh middleware** (`app/middleware.ts` →
  `POST /auth/refresh`) reached `main` but never prod. Because data-plane `0.17.0` issues ~15-min access
  tokens, the new web build (with refresh) and the `0.17.0` data-plane MUST land in the **same** deploy.
- **Document verifying the data-plane actually recreated after a deploy (`DEPLOY.md`).** A new data-plane
  pin only takes effect if the sidecar is recreated onto the new image, which needs that image **cached**
  on the box — otherwise the non-fatal (keychain-locked-over-SSH) pull leaves it on the **old** image
  (e.g. `0.15.0`): `POST /auth/refresh` **404s** and `GET /auth/config` shows `email:false` (old container
  = old env, no SMTP). Adds the check (`make deploy-ps`) and the fix — cache the image, then `docker
  compose -f app/compose.prod.yaml --env-file app/.env.prod up -d --force-recreate data-plane`.

## [0.8.1] — 2026-07-08

### Fixed

- **Reconcile prod secrets onto ONE unambiguous file — `app/.env.prod` — and close the silent-`app/.env`
  fallback that hid SMTP.** On a box that still carried a plain `app/.env` (pre-`0.15.1`) with no
  `app/.env.prod`, `forge deploy` passed no `--env-file` (its default is sent *only when the file
  exists*), so Compose fell back to its default env file — **`app/.env`** (resolved in the `app/` dir) —
  and every var added to `app/.env.prod` per `PROVISIONING.md` was silently ignored: the deploy stayed up
  and Google sign-in worked (`configured.google:true`), but `SMTP_URL`/`EMAIL_FROM` were never read so
  email stayed off (`configured.email:false`). `make deploy` now runs `forge deploy … --env-file
  app/.env.prod` **explicitly**, so a missing `app/.env.prod` is a loud error, not a silent fallback to
  `app/.env`; the raw-compose helpers (`make deploy-config/ps/logs/down`) already name the same file.
- **Document the one-time migration for existing boxes** so there is one clear prod secrets file. `DEPLOY.md`
  (step 4) and the generated `app/PROVISIONING.md` now tell an operator who still has a plain `app/.env` to
  migrate once — `cp app/.env app/.env.prod`, add `SMTP_URL` (URL-encode reserved chars, e.g. `@`→`%40`) +
  `EMAIL_FROM`, `rm app/.env`, redeploy, then re-check `GET /auth/config` → `"email":true`. Verified with
  `docker compose -f app/compose.prod.yaml config` that a bare run reads `app/.env` while `--env-file
  app/.env.prod` reads that file, and that `SMTP_URL`/`EMAIL_FROM` interpolate into **both** the `web` and
  `data-plane` services. Flags the residual forge-side papercut: the platform silently reads Compose's
  default (`app/.env`) when the explicit `--env-file` target (`app/.env.prod`) is absent.

## [0.8.0] — 2026-07-08

### Added

- **Adopt forge `0.17.0`'s refresh-revocation session model (P8/P9) — stay signed in through short-lived
  access, but make logout/reset take effect immediately.** The access `forge_session` is now short-lived
  (~15 min), so the gate is no longer "verify or reject." When it is absent/expired/invalid **and** an
  opaque `forge_refresh` cookie is present, `middleware.ts` makes a server-side, same-origin
  `POST /auth/refresh` (forwarding the request cookies). On `200` it copies the two rotated `Set-Cookie`
  headers onto the response **and reflects them into the current request** so the same render's server code
  (`requireOwner`/`getSession`) verifies the fresh token — no bounce, no 500, and no round-trip on the common
  (unexpired) path. On `401` the session is truly dead (logout / reset / server-side revocation): the gate
  honors the platform's cookie-clear and 302s a page to `/auth/login` (401s an `/api/*` route). Public
  (`/auth/*`, `/api/health`) and service (`/api/cron/*` token) paths are unchanged and never refresh.
  Verified live (dev, `FORGE_AUTH_INSECURE_COOKIES=1`): login sets **both** cookies (access `exp` = `iat`+900s;
  `forge_refresh` opaque, `Path=/; HttpOnly; SameSite=Lax; Max-Age≈30d`); a genuinely-expired-but-signed access
  token + a valid refresh renders the protected page and **rotates both cookies**; logout then makes
  `POST /auth/refresh` return `401 {error:{code:'unauthenticated'}}` and the gate bounce to login — a dead
  session, not one valid-until-exp.
- **Adopt the C13 provisioning-doc generator (forge `0.17.0`) — a generated operator runbook + annotated env
  template.** `forge productionize` now emits `app/PROVISIONING.md` (per secret: capability · required/optional
  · what it is · how to obtain) and an annotated `app/.env.prod.example` (a `#` comment block per secret),
  listing exactly this app's secrets. `PROVISIONING.md` carries the **"Enabling a working sign-in method"**
  section with the Google redirect URI `https://forge-os.mardash.ai/auth/google/callback`. Real values stay
  in the gitignored `app/.env.prod` (a human step).

### Changed

- **Declare the C10/C12 auth + email secrets so prod interpolates them.** `forge provision` now declares
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_URL`, and `EMAIL_FROM` (names only — values are the
  human's, in `app/.env.prod`); the regenerated `app/compose.prod.yaml` injects all four into the web **and**
  data-plane containers. `AUTH_SESSION_SECRET`/`AUTH_SERVICE_TOKEN` are unchanged.
- **Pin the Forge platform images to `0.17.0`** (multi-arch, `linux/arm64` confirmed) — the release carrying
  P8/P9 (refresh) and C13 (provisioning docs): control-plane in `compose.yaml`
  (`forge-control-plane:0.17.0@sha256:69fe7ea2…`) and data-plane in `app/compose.yaml`, `app/compose.prod.yaml`,
  and `app/forge.app.json` (`forge-data-plane:0.17.0@sha256:465ae7cc…`). The app's own web image is unchanged.
- **Un-stale the docs.** `PROJECT_IDEA.md` now records the short-lived + revocable session model and the
  generated provisioning runbook; `DEPLOY.md` notes the repo now runs on forge `0.17.0` (which still carries
  the P10/P11 deploy fixes). The full prod cutover (real Google OAuth app + SMTP creds + the box roll) stays a
  human step; the dev-level verification above is green.

## [0.7.1] — 2026-07-07

### Fixed

- **Adopt the two C8 deploy-blocker fixes from forge `0.15.1` (P10 + P11) — a plain `forge deploy` now
  ships prod cleanly.** Both surfaced during this app's C10 auth prod cutover and are now fixed
  upstream; this repo runs on `0.15.1` and drops its local workarounds. (A full on-box prod roll — real
  Google OAuth + SMTP + the roll — remains a **human step**; the dev-level verification below is green.)
  - **P10 · env-file default.** `forge deploy` now defaults `--env-file` to **`app/.env.prod`** (passed
    only when the file exists; overridable) — so the productionize example (`app/.env.prod.example`),
    the compose `${POSTGRES_PASSWORD:?…set…in .env.prod}` hint, and the deploy default **all name
    `app/.env.prod`**, and a plain `forge deploy` loads the prod secrets instead of silently ignoring
    them. The canonical prod-secrets file moves `app/.env` → **`app/.env.prod`**; `DEPLOY.md` and the
    `make deploy-*` helpers (now `--env-file app/.env.prod`) follow. Verified: `docker compose -f
    app/compose.prod.yaml --env-file app/.env.prod config` resolves (exit 0) while the same command
    **without** `--env-file` fails at `POSTGRES_PASSWORD` interpolation, and `forge deploy --help`
    shows `--env-file … (default: "app/.env.prod")`.
  - **P11 · always-on `/auth` rewrite.** The generated `next.config.mjs` now **always** emits the
    `/auth/*` rewrite defaulted to `http://data-plane:3718` (a runtime `FORGE_DATA_PLANE_URL` still
    overrides) — the exact pattern this app hand-worked-around during C10 is now canonical upstream.
    Verified: a clean image build with **no** `FORGE_DATA_PLANE_URL` still bakes `/auth/:path*` →
    `http://data-plane:3718` into the image's `.next/routes-manifest.json`.

### Changed

- **Pin the Forge platform images to `0.15.1`** (multi-arch, arm64 confirmed) — the release that
  carries the P10/P11 deploy-blocker fixes: control-plane in `compose.yaml`
  (`forge-control-plane:0.15.1@sha256:925ffd09…`), data-plane in `app/compose.yaml`,
  `app/compose.prod.yaml`, and `app/forge.app.json` (`forge-data-plane:0.15.1@sha256:804f5c47…`). The
  app's own web image is unchanged (already the login-fixed build).
- **Fold `DEPLOY.md`'s "Platform papercuts" note into "FIXED in forge 0.15.1."** Both the env-file
  mismatch (P10) and the build-time `rewrites()` trap (P11) are resolved upstream; the workaround prose
  becomes the record of the fix that new apps (and forge-starter) now inherit.

## [0.7.0] — 2026-07-07

### Added

- **Adopt the platform's Permissions / per-user ownership (C11) — the app is now fully multi-user and
  isolated.** Every resource is scoped to its owner (the C10 session `userId`); two users share the
  deployment yet see entirely separate apps. This closes **Epic M · M2 (authorization)** — the last gap
  after M1 (authentication, C10). Verified **live with two users**: the owner sees their own
  goals/tasks/habits/timeline/notifications, a second user sees an empty app, and each user's by-id fetch
  of the other's goal is a **404**.
  - **Own the app's own tables.** `goals`, `tasks`, `habits`, `habit_checkins`, and `habit_streak_breaks`
    gain an `owner_id` (indexed); children inherit their parent's owner. **Every** query in `lib/db.ts`
    filters by the session user, and a row owned by another user is simply absent — a by-id fetch returns
    **404, never 403**, so existence never leaks. The system-wide C2 streak-finalize cron stays cross-owner
    (it settles every user's habits and stamps each break with its habit's owner).
  - **Pass `owner` to the shared platform stores.** The C3 events client (`lib/forge-events.ts`), C4
    notifications client (`lib/forge-notifications.ts` / `lib/notification-inbox.ts`), and C1 agent-run
    client (`lib/forge-agent.ts`) now send the opaque `owner` on every call — write stamps it, read filters
    to it — so timelines, inboxes, and agent-run history are per-user too.
  - `lib/auth.ts` — new `requireOwner()` returns the session `userId` (the owner) and fails closed; every
    page, route, and the `SiteNav` badge resolve it and thread it into the db + client layers.
  - **Migration (cutover).** Existing rows were backfilled to the seeded owner and owner-less shared-store
    records claimed via `forge owner claim-legacy --app forge-os` (idempotent).

### Changed

- **Pin the Forge platform images to `0.15.0`** (multi-arch, arm64 confirmed) — the release that carries
  C11's owner-aware shared stores: control-plane in `compose.yaml`, data-plane in `app/compose.yaml`,
  `app/compose.prod.yaml`, and `app/forge.app.json`.
- **Un-stale `PROJECT_IDEA.md`:** security status flips to **authenticated + fully multi-user isolated**;
  **Epic M · M2 (C11)** is marked **shipped / adopted (`0.7.0`)** across §2/§3/§5/§6. Only status lines
  change — the human's authored prose is untouched.

## [0.6.1] — 2026-07-07

### Changed

- **Un-stale `PROJECT_IDEA.md` now that Identity / Auth (C10) is adopted.** The doc's security status
  flips from "**no authentication** / open app" to **authenticated** — the app is gated on the
  platform's hosted Identity/Auth (Google OAuth + email/password, multi-user signup, a hosted login
  surface, a session middleware; `/api/cron/*` service-token'd, `/api/health` public). **Epic M · M1
  (Authentication)** is marked **shipped / adopted (`0.6.0`)** across §2/§3/§5/§6, and **M2 (per-user
  ownership / authorization)** is noted as **next / in progress** (filed as **C11**). Only stale
  status/security lines change — the human's authored vision/prose is untouched.
- **Amend the `add-a-feature` skill to keep `PROJECT_IDEA.md` current going forward.** Step 6 ("Record
  the platform pressure — backstop") and the loop diagram now require, on finishing a feature, a
  lightweight **`PROJECT_IDEA.md` status touch-up**: mark the feature/epic shipped and correct any
  line the feature makes stale (especially security-relevant ones), so the product doc never drifts
  from reality. Step 7's commit list includes it.

## [0.6.0] — 2026-07-07

### Added

- **Adopt the platform's hosted Identity / Auth (C10) — the whole app is gated now.** forge-os ships
  **no auth UI and no auth tables**: it proxies the platform's hosted `/auth/*` surface and verifies
  the platform-issued session locally. Sign-in/up/reset all live on the hosted pages; we only gate.
  This closes the "**no authentication**" security gap called out in `PROJECT_IDEA.md` (Epic M).
  - `middleware.ts` — the gate. Every page and `/api/*` route requires a valid session **except**:
    `/auth/*` (the hosted surface, proxied), `/api/health` (public readiness, C6), and `/api/cron/*`
    (service-scoped). An unauthenticated **page** → `302 /auth/login?next=<path>` (with `next`
    sanitized to a local path — no open redirect); an unauthenticated **`/api/*`** → `401`.
  - `lib/auth.ts` — `getSession()` / `requireUser()` plus an Edge-safe `verifySessionToken()`. The
    `forge_session` cookie is a compact **HS256 JWS** (`{ userId, email, sessionId, iat, exp }`);
    we verify the signature + `exp` **locally with `AUTH_SESSION_SECRET`** (via `jose`) — **no
    round-trip** for the gate. Per-user row ownership stays out of scope (that is C11).
  - `/api/cron/*` is now **closed**: admitted only on a matching service token
    (`X-Forge-Service-Token` or `Authorization: Bearer` == `AUTH_SERVICE_TOKEN`, constant-time),
    which the C2 scheduler attaches on cron callbacks — previously these routes were open.
  - Same-origin `/auth/:path*` **rewrite** in `next.config.mjs` → `${FORGE_DATA_PLANE_URL}/auth/*`,
    so the session cookie lands on our domain (`SameSite=Lax` needs it) and no auth UI is shipped.
  - `SiteNav` gains an account tail: the signed-in email + a hosted **Sign out** (`/auth/logout`)
    link (**Sign in** → `/auth/login` when signed out), rendered from `getSession()`.
  - New dependency **`jose` 5.9.6** (HS256 verify; Web-Crypto based, works in the Edge runtime).
  - Declare the C5 secrets **`AUTH_SESSION_SECRET`** + **`AUTH_SERVICE_TOKEN`** (injected into the
    web tier **and** the data-plane); **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`** are declared
    but left for a human (a real Google OAuth app) — email/password gates the app without them.
  - Dev runs the hosted auth as a **single-app Forge data-plane sidecar** (the same image + role as
    prod) sharing the control plane's state dir, so it infers the app and the same-origin proxy
    works identically in dev and prod. Local http dev issues non-Secure cookies
    (`FORGE_AUTH_INSECURE_COOKIES=1`).

### Changed

- **Bump the Forge images to `0.14.0` (multi-arch, digest-pinned).** Control plane
  `0.12.0 → 0.14.0` and data-plane `0.11.1 → 0.14.0` (`compose.yaml`, `compose.prod.yaml`,
  `forge.app.json`); `0.14.0` carries C10 hosted auth (plus C12 email + the P4 `.next` fix). The
  prod stack was regenerated via `forge productionize` to inject the auth secrets into both tiers.
- **Expand `PROJECT_IDEA.md` into a full vision / status / backlog** — Wave 1 (C1–C8) marked done and
  **Identity / Auth (Epic M)** flagged the near-term priority, which is the pressure this release
  answers.

## [0.5.0] — 2026-07-07

### Added

- **Add step 0 (Feature Brief → Gate 0) to the `add-a-feature` skill — platform-vs-app is decided at
  feature inception now.** Before any app code, the workflow emits a lightweight **Feature Brief**
  (four fields: `feature/behavior`, `persisted state`, `generic machinery touched`,
  `self-read platform-vs-domain`) and hands it to the **orchestrator**, which rules each moving part
  **app-local** (build in `./app`) vs. **platform** (it files a `Cn`, and may direct forge-os to
  **WAIT** and adopt via the normal relay rather than build a stopgap). The brief fires for every
  feature — most rulings are a fast "app-local, proceed" — and forge-os waits for the ruling before
  writing app code. This moves platform pressure from a late, post-hoc refactor to an up-front gate.

### Changed

- **Reframe `add-a-feature` step 6 ("what generic machinery did I just build?") as the backstop, not
  the primary check.** Gate 0 (step 0) is now the primary platform-vs-app decision; step 6 remains as
  the safety net that catches only pressure Gate 0 misjudged (machinery that revealed itself as
  generic after it was built). The loop diagram and intro are updated to lead with the brief.

## [0.4.0] — 2026-07-07

### Changed

- **Adopt the standard health/telemetry contract (C6) — `/api/health` reports real readiness now.**
  Replace the bespoke always-`ok` payload with the platform's standard schema
  (`{ status, service, time, checks: [{ name, status, detail? }] }`) and its HTTP-code convention:
  **200** for `ok`/`degraded`, **503** when a *required* check is `unavailable`. `/api/health` now
  declares `service: 'forge-os'` plus one **required** `db` check (a `SELECT 1` round-trip to
  Postgres via `lib/db.ts`), so the endpoint is genuine liveness+readiness rather than a
  liveness-only lie. The route stays `force-dynamic` / no-cache and collapses to ~8 lines; the
  aggregation + status/code rollup live in `lib/health.ts` (`buildHealth`). `forge inspect health
  --app forge-os` renders the overall status + per-check rollup and confirms the payload `conforms`
  to the contract.
- **Bump the control-plane default to `forge-control-plane:0.12.0@sha256:d5943450…`** (`compose.yaml`,
  multi-arch amd64+arm64; supersedes `0.11.1`, which it subsumes) — `0.12.0` ships the C6 `inspect
  health` observer. No data-plane change (C6 ships no data-plane code; the probe is the app's own
  route). Refresh the `DEPLOY.md` default control-plane image note to match.

### Added

- **`buildHealth(service, checks)` in `lib/health.ts`** — the vendored C6 contract helper: runs the
  opaque check thunks, maps each to `ok`/`unavailable` (a thrown error's message becomes `detail`),
  rolls up to `ok`/`degraded`/`unavailable`, and picks `200`/`503`. A failing **non-required** check
  degrades (200, flagged) rather than failing the service; `checks: []` is liveness-only.
- **`pingDb()` in `lib/db.ts`** — a cheap Postgres readiness probe (`SELECT 1`, deliberately skips
  the schema bootstrap) that throws when the database is unreachable; wired as the `/api/health`
  required `db` check.

### Removed

- **The bespoke `HealthPayload` / `healthPayload()` in `lib/health.ts`** — the always-`ok`,
  liveness-only payload that never checked anything. `tests/health.test.ts` now exercises
  `buildHealth` (ok/200, required-fail/503, non-required-degrade/200, liveness-only/empty-checks).

## [0.3.1] — 2026-07-07

### Fixed

- **Re-adopt the C8 `Productionize` prod-correctness fixes (forge `0.11.1`).** The first generated
  `app/compose.prod.yaml` (C8, `0.11.0`) had three generator bugs that broke prod runtime wiring; the
  platform fixed the **generator** in `0.11.1`, so re-running `forge productionize` regenerates the
  stack with all of them closed. Bump the control-plane default to
  `forge-control-plane:0.11.1@sha256:433a0142…` (`compose.yaml`, dev control-plane) and re-run
  `forge productionize --app forge-os --host forge-os.mardash.ai --web-image
  ghcr.io/mardash-ai/forge-os-app@sha256:2d2088f9… --data-plane-image
  ghcr.io/mardash-ai/forge-data-plane:0.11.1@sha256:759b27a6… --readiness-path /api/health
  --cert-resolver letsencrypt` (both images multi-arch amd64+arm64; the data-plane pin is bumped in
  `app/compose.prod.yaml` + `app/forge.app.json`). The regenerated compose now carries:
  - **(P7.1)** `web` gets `FORGE_EVENTS_URL=http://data-plane:3718` — the base URL the app's
    C1/C3/C4 clients (`lib/forge-agent.ts`, `lib/forge-events.ts`, `lib/forge-notifications.ts`) read
    — with `FORGE_DATA_PLANE_URL` kept as an alias, so prod no longer loses data-plane reachability.
  - **(P6)** the `data-plane` sidecar gets `FORGE_SECRETS_KEY=${FORGE_SECRETS_KEY:-}` **and** each
    declared secret (`ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}`), so it can decrypt the C5 vault the
    agent runtime (C1) reads in prod — `agent-run` no longer 503s. `app/.env.prod.example` now
    documents `FORGE_SECRETS_KEY`; a local `.env.prod` (gitignored) holds the real value.
  - **(P7.3)** add `app/forge.jobs.json` declaring the `habits-finalize` C2 job
    (`cron 5 0 * * *` → `/api/cron/habits-finalize`); the generator bind-mounts it `:ro` and pins
    `FORGE_JOBS_FILE=/app/forge.jobs.json`, so the job auto-registers on boot in prod.
- **Simplify `make deploy` (P7.2).** `forge deploy`'s `--compose-file` now defaults to
  `app/compose.prod.yaml` (what `forge productionize` emits), so `make deploy` drops the explicit
  `--compose-file app/compose.prod.yaml`. Gitignore `.env.prod`, and refresh `DEPLOY.md` — the
  "Known gaps after C8" section becomes "fixes landed in `0.11.1`". A full prod-deploy on the box
  remains a pending human step.

## [0.3.0] — 2026-07-07

### Changed

- **Adopt Forge `Productionize` (C8) — the production stack is GENERATED now.** `forge productionize`
  emits the canonical prod artifacts from the app's persisted `infra` (`forge.app.json`) + `--host`,
  replacing the hand-authored ones: `app/Dockerfile` (Next standalone, non-root `nextjs` user),
  `app/.dockerignore`, `app/compose.prod.yaml` (Traefik `Host(forge-os.mardash.ai)` +
  `loadbalancer.healthcheck` `/api/health` + `stop_grace_period` + the data-plane sidecar + Postgres,
  all digest-pinned — web `forge-os-app@sha256:2d2088f9…`, data-plane
  `forge-data-plane:0.11.0@sha256:0528e920…`), and `app/.env.prod.example`. A `production` block is
  persisted in `forge.app.json` (host, readiness path, image pins, cert resolver) so a **flag-less
  re-run is byte-identical** (convergent). `output: 'standalone'` in `app/next.config.mjs` is set
  idempotently (already ours — unchanged). Command:
  `forge productionize --app forge-os --host forge-os.mardash.ai --web-image <ref@sha256:…>
  --data-plane-image ghcr.io/mardash-ai/forge-data-plane:0.11.0@sha256:0528e920… --readiness-path
  /api/health --cert-resolver letsencrypt` (R1: bare-tag / `latest` image flags are rejected `422`).
- **Bump the control-plane image to `0.11.0`** (`forge-control-plane:0.11.0@sha256:50fa8ade…`,
  multi-arch amd64+arm64) in `compose.yaml` (dev control-plane default) — the release that ships C8.
- **Repoint deploy tooling at the generated stack.** The prod stack now lives at
  `app/compose.prod.yaml`; `make deploy` passes `--compose-file app/compose.prod.yaml` (`forge deploy`
  resolves it relative to the repo root), the `make deploy-*` convenience targets use
  `docker compose -f app/compose.prod.yaml`, and `DEPLOY.md` documents the generated flow. Image
  digests are baked into the generated compose (no more `${APP_IMAGE}`/`${FORGE_DATA_PLANE_IMAGE}`
  `.env` indirection) — re-run `forge productionize` to change them. **Known gaps** the generic
  generator does not yet carry (deferred to a prod cutover; see `DEPLOY.md` → "Known gaps"): the
  data-plane base-URL var is emitted as `FORGE_DATA_PLANE_URL` while the app's C1/C3/C4 clients read
  `FORGE_EVENTS_URL`; the data-plane sidecar gets no `FORGE_SECRETS_KEY` for the C5 vault the agent
  runtime (C1) reads (**P6** — still open); and the C2 jobs file is no longer bind-mounted.

### Removed

- **Delete the hand-authored production artifacts, now generated by C8:** the repo-root
  `compose.prod.yaml` and `.env.prod.example` (superseded by `app/compose.prod.yaml` +
  `app/.env.prod.example`). The hand-authored `app/Dockerfile` + `app/.dockerignore` are overwritten
  in place by the generated versions.

## [0.2.1] — 2026-07-07

### Fixed

- **Adopt the Forge `0.10.0` maintenance release (P4/P5/P2).** Bump both images to `v0.10.0` — control
  plane `forge-control-plane:0.10.0@sha256:9760b58b…`, data plane `forge-data-plane:0.10.0@sha256:067f6850…`
  (both multi-arch amd64+arm64) — in `compose.yaml` (dev control-plane default), `compose.prod.yaml`
  (the data-plane sidecar), and `.env.prod.example` (both planes). Two platform fixes land transparently
  on the bump: **(P4)** `forge dev` now auto-resets a stale production `.next` before starting, so a
  `forge build` → `forge dev` sequence no longer 500s with
  `Cannot find module './chunks/vendor-chunks/next.js'` (verified: build → dev with no manual `.next`
  cleanup serves `200`); and **(P2)** a new `forge secrets unset --name <NAME>` (idempotent; never
  returns the value) is now available — additive, no app change.
- **Drop the C4 notification-store serialization workaround now that the store is atomic (P5).** The
  platform notifications store is now atomic under concurrent writes (per-app mutex + atomic file
  replace), so `syncNotifications` (`lib/notification-inbox.ts`) fires the reconcile's upserts + clears
  **concurrently** again via `Promise.all`, reverting the one-write-at-a-time loop added as a
  lost-update guard. `GET /api/notifications` is now deterministic under load (30 fully-concurrent reads
  return one identical body; no flicker). Behavior is otherwise identical; the explicit
  `Notification`/`PlatformNotification` annotations are retained.

## [0.2.0] — 2026-07-07

### Added

- **Adopt the Forge agent runtime (C1).** The Planner no longer calls a local model SDK — the app
  hands the platform its DOMAIN (the Planner's system prompt, the goal input, and the tasks JSON
  Schema) and gets back a parsed, schema-valid result. `POST /api/goals/[id]/plan` is now a thin
  call over a new `lib/forge-agent.ts` client to the platform's `POST /capabilities/agent-run`
  (over the same C3/C4 data-plane base URL `FORGE_EVENTS_URL`); the returned `resource.artifact` is
  post-validated with the app's own `cleanProposedTasks` policy — model output stays untrusted —
  before it reaches the `PlanTasks` review UI. The platform runs the model, enforces the structured
  output, and stores the run + Artifact (`forge inspect agent-runs`; facts `AgentRunSucceeded` /
  `ArtifactCreated`), so the model key stays in Forge's vault (the reused C5 secret
  `ANTHROPIC_API_KEY`) and never reaches the app. Bump both images to `v0.9.0` — control plane
  `forge-control-plane:0.9.0@sha256:ac96af30…`, data plane `forge-data-plane:0.9.0@sha256:65dce681…`
  (both multi-arch amd64+arm64). Graceful degradation is unchanged in behavior but now driven by the
  capability's `503 dependency_unavailable` (unconfigured key) rather than a local env check: the
  endpoint still `503`s and the app stays up, with no run persisted.

### Removed

- **Drop the local Planner model stack now that C1 owns it.** Delete the `agent_runs` table and
  `recordAgentRun()` (`lib/db.ts` 584→519 lines), delete `lib/agent.ts` (the direct Anthropic call
  and `isPlannerConfigured()`), and drop the `@anthropic-ai/sdk` dependency from `app/package.json`.
  Clean cutover — the old `agent_runs` history is abandoned; the platform is the run system of record
  now. Keep the domain: the Planner's prompt, the `cleanProposedTasks` post-validation, and the
  `PlanTasks` review UI.

## [0.1.1] — 2026-07-06

### Added

- **Adopt the canonical `CHANGELOG.md` + `/commit-code` workflow.** Reformat this changelog to
  Keep a Changelog 1.1.0 (em-dash version headings, a permanent `[Unreleased]` section, footer
  compare links) and add a `/commit-code` command that enforces, on every commit, a SemVer bump of
  `app/package.json` (the version source of truth) plus a matching dated entry here. The command
  never publishes an image or pushes a tag — image release stays with the platform's own pipeline.
- **Adopt the Forge notifications store (C4).** The inbox is no longer derived-and-filtered against a
  local `dismissed_notifications` table — the app now derives *which* conditions matter (overdue
  task, cold goal) and their copy, then upserts the true ones, clears the stale ones, and dismisses
  on the inbox action against the platform via a new `lib/forge-notifications.ts` client, rendering
  from the platform feed (`lib/notification-inbox.ts` reconciles and reads). Upsert is idempotent by
  `key` and preserves `dismissed` and `created_at`, so a still-true, already-dismissed alert never
  resurfaces. Bump the control plane to `forge-control-plane:0.8.0@sha256:95a2aead…` and the data
  plane to `forge-data-plane@sha256:7de5566e…` (both multi-arch amd64+arm64). Unavailable-tolerant
  like C3: if the store can't be reached the inbox reads `[]` and mutations still succeed — no crash.
  Remove the `dismissed_notifications` table and its DB code; the `/api/notifications*` routes are now
  thin clients over the platform (`lib/db.ts` 593→584 lines).
- **Adopt the Forge application event log (C3).** The Timeline and cold-goal detection now read the
  app's own domain events from Forge instead of a local `events` table — the app's first outbound
  integration with the platform. Each mutation emits (best-effort, never blocking) via a new
  `lib/forge-events.ts` client; the feed, per-goal filter, and "last activity" all read it back. Bump
  the control plane to `forge-control-plane:0.7.0@sha256:b4933e46…` and pin the first data-plane
  image (`forge-data-plane@sha256:107ecff5…`) for prod. The event log is unavailable-tolerant: if it
  can't be reached, the feed is empty and mutations still succeed. Remove the `events` table and its
  query layer (`lib/db.ts` shrinks 656→593 lines).
- **Adopt the Forge scheduler (C2).** A durable UTC-midnight job (`POST /api/cron/habits-finalize`)
  now finalizes each habit's closed period and persists streak breaks in a new `habit_streak_breaks`
  table — giving Habits a real period boundary instead of a purely read-time reset. The job is
  idempotent (safe under the scheduler's retries) and the read-time streak derivation is unchanged as
  the source of truth. Bump the control plane to `forge-control-plane:0.4.0@sha256:9d216618…`
  (multi-arch). The Reminders push job is deferred to the Notifications capability (C4).
- **Add a write baton to `PLATFORM_CAPABILITIES.md`.** A single-writer lock at the top of the ledger
  serializes edits to the two-agent capability ledger across the human relay, guarding against
  stale-overwrite.
- **Add requirement R3 to `PLATFORM_CAPABILITIES.md`: classify every capability by plane** —
  `control-plane` (dev/orchestration; build/test/`provision` tooling) vs `data-plane` (production
  runtime dependency the running app needs) vs `both`. Add a `Plane` field to each capability and to
  the delivery-block template so Forge knows which of its future control-plane / data-plane images
  must carry each capability, and dev dependencies don't leak into production. Classify the existing
  ledger: C1–C4 and C6 are data-plane, C5 spans both, and the `provision`/build/test tooling is
  control-plane.

### Changed

- **Bump the Forge control plane to `forge-control-plane:0.3.0@sha256:8d0dea66…` (was `0.2.0`),
  adopting the platform fix for P1.** `forge provision` is now idempotent/convergent: it persists the
  app's desired infra (Postgres/Redis/secrets + host-port remaps) in `forge.app.json` and converges
  from it, so a flag-less re-provision keeps every existing service and the `5433:5432` Postgres
  remap, and it refuses to drop a data-volume service without `--force`. Verify the original footgun
  (a `--secret`-only provision silently dropping Postgres) is gone. Update the `provision-app` skill
  (here and in forge-starter) to describe the convergent behavior, scoping the old "re-pass every
  flag" warning to control planes older than `0.3.0`.
- **Adopt Forge-managed secrets (C5).** `ANTHROPIC_API_KEY` is now stored in Forge's encrypted vault
  and injected into the app container at `forge dev`, replacing the hand-wired `app/.env` + compose
  plumbing. Pin the control plane to `forge-control-plane:0.2.0@sha256:924814d3…` (multi-arch) in the
  tracked root `compose.yaml`. `isPlannerConfigured()` and the graceful 503-when-absent behavior are
  unchanged.

### Removed

- **Remove the `app/.env` secret file and the `ANTHROPIC_API_KEY` documentation in
  `app/.env.example`** — the key is no longer stored in the app; set it with `forge secrets set --app
  forge-os --name ANTHROPIC_API_KEY`.

### Fixed

- **Adopt the P3 fix and unify the control-plane pin at `0.6.1`.** Bump the dev control plane
  `0.4.0 → 0.6.1@sha256:482bda5c…` (the max over adopted C2/C5/C7, which folds in P3's `0.5.1`
  healthcheck fix) and re-provision. The generated Postgres healthcheck now names the database
  (`pg_isready -U forge -d forge_os`), silencing the `FATAL: database "forge" does not exist` log
  spam that appeared every 10s. Dev and the `make deploy` transient control plane now run one pinned
  image. Re-validate: build/test (80/0)/lint green; the `habits-finalize` cron job survived the
  restart.
- **Unblock C5's multi-arch delivery.** C5 was briefly blocked because the delivered `0.2.0` image
  was `amd64`-only on an `arm64` host; the platform-builder republished it multi-arch, unblocking
  adoption.
- **Remove dangerous guidance in the `provision-app` skill** (and mirror the fix to forge-starter):
  it advised a **flag-less** `forge provision` to fix a build error, which silently drops
  Postgres/secrets since provision regenerates compose from the flags passed. It now warns that
  `provision` is replace-from-flags and to re-pass every infra flag. File the underlying platform
  behavior as **P1** (make `provision` idempotent) and request **P2** (`secrets unset`) in
  `PLATFORM_CAPABILITIES.md`.

_This changelog started mid-project: the Goals & Tasks core and the Timeline → Time & Today →
Reminders → Planner Agent → Habits features predate it; see `PROJECT_IDEA.md`'s roadmap and the git
history for that record._

[Unreleased]: https://github.com/mardash-ai/forge-os/compare/v0.12.2...HEAD
[0.12.2]: https://github.com/mardash-ai/forge-os/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/mardash-ai/forge-os/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/mardash-ai/forge-os/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/mardash-ai/forge-os/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/mardash-ai/forge-os/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/mardash-ai/forge-os/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/mardash-ai/forge-os/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/mardash-ai/forge-os/compare/v0.8.3...v0.9.0
[0.8.3]: https://github.com/mardash-ai/forge-os/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/mardash-ai/forge-os/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/mardash-ai/forge-os/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/mardash-ai/forge-os/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/mardash-ai/forge-os/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/mardash-ai/forge-os/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/mardash-ai/forge-os/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/mardash-ai/forge-os/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/mardash-ai/forge-os/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/mardash-ai/forge-os/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/mardash-ai/forge-os/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/mardash-ai/forge-os/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/mardash-ai/forge-os/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/mardash-ai/forge-os/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/mardash-ai/forge-os/commit/c9c545411f2401b5c849cd0f6682604d1b7ad712
