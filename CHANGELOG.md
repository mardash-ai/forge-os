# Changelog

All notable changes to **forge-os** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/mardash-ai/forge-os/compare/v0.7.0...HEAD
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
