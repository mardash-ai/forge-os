---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Read, Edit, Write
description: Update the changelog and create a git commit
---

## Context

Current git status: !`git status`
Current git diff (staged and unstaged changes): !`git diff HEAD`
Current branch: !`git branch --show-current`
Recent commits: !`git log --oneline -10`

## Your Task

1. **Update `CHANGELOG.md`** so it records the changes above (Keep a Changelog format, Semantic
   Versioning):
   - Read `CHANGELOG.md`. If it does not exist, create it from the standard skeleton (a title, the
     Keep a Changelog + SemVer preamble, and an empty `## [Unreleased]` section).
   - Summarize the changes as one or more human-readable bullets under `## [Unreleased]`, in the
     right category — **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, or
     **Security**. Create the category subheading if it's missing. Write for a reader, not as a raw
     diff; skip trivial noise (formatting-only churn, this changelog edit itself).
   - Do **not** invent a version number or date — entries stay under `[Unreleased]` until a release
     is cut. (Releasing — moving `[Unreleased]` into a dated `## [x.y.z]` section and bumping the
     version — is the job of the release step, not this skill.)
2. **Create a single git commit** that includes `CHANGELOG.md` together with the other changes.
   Follow the repo's commit-message conventions.
