# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accrue under **[Unreleased]** and move into a dated, versioned section when a release is
cut. Bump the version by the nature of the change: **MAJOR** for breaking changes, **MINOR** for
new backwards-compatible features, **PATCH** for backwards-compatible fixes.

## [Unreleased]

### Added

- `CHANGELOG.md` (this file), following Keep a Changelog + Semantic Versioning. The `/commit-code`
  skill now maintains it automatically on every commit.
- Write baton (single-writer lock) at the top of `PLATFORM_CAPABILITIES.md` — serializes edits to
  the two-agent capability ledger across the human relay, guarding against stale-overwrite.

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
