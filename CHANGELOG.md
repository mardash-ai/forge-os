# Changelog

All notable changes to **forge-os** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/mardash-ai/forge-os/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/mardash-ai/forge-os/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/mardash-ai/forge-os/commit/c9c545411f2401b5c849cd0f6682604d1b7ad712
