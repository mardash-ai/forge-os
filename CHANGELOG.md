# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accrue under **[Unreleased]** and move into a dated, versioned section when a release is
cut. Bump the version by the nature of the change: **MAJOR** for breaking changes, **MINOR** for
new backwards-compatible features, **PATCH** for backwards-compatible fixes.

## [Unreleased]

### Added

- **Adopted the Forge application event log (capability C3).** The Timeline and cold-goal detection
  now read the app's own domain events from Forge instead of a local `events` table — the app's first
  outbound integration with the platform. Each mutation emits (best-effort, never blocking) via a new
  `lib/forge-events.ts` client; the feed, per-goal filter, and "last activity" all read it back. Bumped
  the control plane to `forge-control-plane:0.7.0@sha256:b4933e46…` and pinned the first **data-plane
  image** (`forge-data-plane@sha256:107ecff5…`) for prod. The event log is unavailable-tolerant: if it
  can't be reached, the feed is empty and mutations still succeed. Removed the `events` table and its
  query layer (`lib/db.ts` shrank 656→593 lines).
- **Adopted the Forge scheduler (capability C2).** A durable UTC-midnight job
  (`POST /api/cron/habits-finalize`) now finalizes each habit's closed period and persists streak
  breaks in a new `habit_streak_breaks` table — giving Habits a real period boundary instead of a
  purely read-time reset. The job is idempotent (safe under the scheduler's retries) and the
  read-time streak derivation is unchanged as the source of truth. Bumped the control plane to
  `forge-control-plane:0.4.0@sha256:9d216618…` (multi-arch). The Reminders push job is deferred to
  the Notifications capability (C4).
- `CHANGELOG.md` (this file), following Keep a Changelog + Semantic Versioning. The `/commit-code`
  skill now maintains it automatically on every commit.
- Write baton (single-writer lock) at the top of `PLATFORM_CAPABILITIES.md` — serializes edits to
  the two-agent capability ledger across the human relay, guarding against stale-overwrite.
- **Requirement R3 in `PLATFORM_CAPABILITIES.md`: classify every capability by plane** — `control-plane`
  (dev/orchestration; build/test/`provision` tooling) vs `data-plane` (production runtime dependency
  the running app needs) vs `both`. Added a `Plane` field to each capability and to the delivery-block
  template so Forge knows which of its future control-plane / data-plane images must carry each
  capability, and dev dependencies don't leak into production. Classified the existing ledger: C1–C4
  and C6 are data-plane, C5 spans both, and the `provision`/build/test tooling is control-plane.

### Changed

- **Bumped the Forge control plane to `forge-control-plane:0.3.0@sha256:8d0dea66…` (was `0.2.0`),
  adopting the platform fix for P1.** `forge provision` is now idempotent/convergent: it persists the
  app's desired infra (Postgres/Redis/secrets + host-port remaps) in `forge.app.json` and converges
  from it, so a flag-less re-provision keeps every existing service and the `5433:5432` Postgres
  remap, and it refuses to drop a data-volume service without `--force`. Verified the original
  footgun (a `--secret`-only provision silently dropping Postgres) is gone. Updated the
  `provision-app` skill (here and in forge-starter) to describe the convergent behavior, scoping the
  old "re-pass every flag" warning to control planes older than `0.3.0`.
- **Adopted Forge-managed secrets (capability C5).** `ANTHROPIC_API_KEY` is now stored in Forge's
  encrypted vault and injected into the app container at `forge dev`, replacing the hand-wired
  `app/.env` + compose plumbing. Pinned the control plane to
  `forge-control-plane:0.2.0@sha256:924814d3…` (multi-arch) in the tracked root `compose.yaml`.
  `isPlannerConfigured()` and the graceful 503-when-absent behavior are unchanged.

### Removed

- The `app/.env` secret file and the `ANTHROPIC_API_KEY` documentation in `app/.env.example` — the
  key is no longer stored in the app; set it with `forge secrets set --app forge-os --name
  ANTHROPIC_API_KEY`.

### Fixed

- **Adopted the P3 fix and unified the control-plane pin at `0.6.1`.** Bumped the dev control plane
  `0.4.0 → 0.6.1@sha256:482bda5c…` (the max over adopted C2/C5/C7, which folds in P3's `0.5.1`
  healthcheck fix) and re-provisioned. The generated Postgres healthcheck now names the database
  (`pg_isready -U forge -d forge_os`), silencing the `FATAL: database "forge" does not exist` log
  spam that appeared every 10s. Dev and the `make deploy` transient control plane now run one pinned
  image. Re-validated: build/test (80/0)/lint green; the `habits-finalize` cron job survived the
  restart.
- C5 was briefly blocked because the delivered `0.2.0` image was `amd64`-only on an `arm64` host;
  the platform-builder republished it multi-arch, unblocking adoption.
- **Removed dangerous guidance in the `provision-app` skill** (and mirrored the fix to
  forge-starter): it advised a **flag-less** `forge provision` to fix a build error, which silently
  drops Postgres/secrets since provision regenerates compose from the flags passed. It now warns that
  `provision` is replace-from-flags and to re-pass every infra flag. Filed the underlying platform
  behavior as **P1** (make `provision` idempotent) and requested **P2** (`secrets unset`) in
  `PLATFORM_CAPABILITIES.md`.

---

_Started mid-project: earlier work (the Goals & Tasks core and the Timeline → Time & Today →
Reminders → Planner Agent → Habits features) predates this changelog; see `PROJECT_IDEA.md`'s
roadmap and the git history for that record._
