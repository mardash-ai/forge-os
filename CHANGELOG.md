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

---

_Started mid-project: earlier work (the Goals & Tasks core and the Timeline → Time & Today →
Reminders → Planner Agent → Habits features) predates this changelog; see `PROJECT_IDEA.md`'s
roadmap and the git history for that record._
