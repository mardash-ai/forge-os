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

---

_Started mid-project: earlier work (the Goals & Tasks core and the Timeline → Time & Today →
Reminders → Planner Agent → Habits features) predates this changelog; see `PROJECT_IDEA.md`'s
roadmap and the git history for that record._
