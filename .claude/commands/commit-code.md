---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git commit:*), Bash(git rev-parse:*), Bash(git rev-list:*), Bash(git tag:*), Bash(npm version:*), Bash(npm --prefix:*), Bash(node:*), Bash(basename:*), Bash(date:*), Read, Edit, Write
description: Bump the SemVer version, update the changelog, and commit — no image publish
argument-hint: "[patch|minor|major|X.Y.Z] [commit message]"
---

## Context

- Current git status: !`git status --short`
- Current branch: !`git branch --show-current`
- Current diff (staged + unstaged): !`git diff HEAD`
- Recent commits: !`git log --oneline -10`
- Current version (source of truth = `app/package.json`): !`npm --prefix app pkg get version`
- Today (UTC, for the changelog date): !`date -u +%Y-%m-%d`

## What this command is

`/commit-code` is how **forge-os** (a wind-tunnel *consumer* app) commits. Every commit is a small
SemVer release: it bumps `app/package.json`, records a matching dated entry in `CHANGELOG.md`, and
makes one commit. It **does NOT** build or publish any image and **does NOT** push a tag — image
release is the platform's pipeline (`.github/workflows/publish-app.yml` publishes on push to `main`
and on `v*` tags; this command never creates that trigger). If you need to publish, that is a
separate, deliberate release step, not this command.

**Invocation:** `/commit-code [patch|minor|major|X.Y.Z] [commit message]`

- The **first token** of `$ARGUMENTS` is the version directive. If it is `patch`, `minor`, `major`,
  or a literal `X.Y.Z`, consume it; otherwise there is no directive and the default is **`patch`**.
- The **rest** of `$ARGUMENTS` is the commit message. If empty, auto-generate a Conventional-Commits
  summary (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`…) from the diff above.

**SemVer policy:** a new user-facing feature ⇒ **minor** (patch resets to 0); a bug fix ⇒ **patch**;
a breaking change ⇒ **major**. When in doubt, prefer the smaller bump and say so in the message.

## Your task — do these in order, and STOP if any guard fails

1. **Guard the branch.** Read the current branch above. If it is **not `main`**, STOP and report:
   `/commit-code` only commits on `main`. Do not switch branches.

2. **Compute the target version.** From the current version and the directive, compute
   `NEWVERSION` (do not bump yet — the changelog needs it first). For an explicit `X.Y.Z` directive,
   `NEWVERSION` is that literal. Otherwise:

   ```
   node -e "const s=require('./app/package.json').version.split('.').map(Number);const d=process.argv[1]||'patch';if(d==='major'){s[0]++;s[1]=0;s[2]=0}else if(d==='minor'){s[1]++;s[2]=0}else{s[2]++}console.log(s.join('.'))" <directive>
   ```

3. **Require a canonical `CHANGELOG.md` entry for this bump.** Read `CHANGELOG.md`. It MUST end up
   with a section `## [NEWVERSION] — <today>` (separator is an **EM DASH `—` U+2014**, never a
   hyphen; date is the UTC `YYYY-MM-DD` from Context) that describes the changes in the diff above.
   - **Move** everything currently under `## [Unreleased]` into the new `## [NEWVERSION] — <today>`
     section, then add bullets for anything in this diff not already captured. Leave `## [Unreleased]`
     present but **empty**.
   - Use only the needed subsections, in this order: `### Added`, `### Changed`, `### Removed`,
     `### Fixed`. Bullets are `- ` (hyphen+space); sub-bullets indent 2 spaces. A feature's lead
     bullet is **bold-scope-prefixed** and ends with a period (e.g. `- **Adopt C4 — Notifications.**
     <prose>`), present/imperative, with routes/flags/env/ids in backticks and cross-refs as inline
     parentheticals like `(C4)`/`(P1)`. No commit hashes or URLs in bullets.
   - Update the **footer compare links** at the very bottom (newest first), using this repo's own
     GitHub `owner/repo` from `git remote get-url origin`:
     - `[Unreleased]: https://github.com/<owner>/<repo>/compare/vNEWVERSION...HEAD`
     - `[NEWVERSION]: https://github.com/<owner>/<repo>/compare/v<prev>...vNEWVERSION`
     - the oldest entry keeps its `.../commit/<initial-sha>` link.
   - **Refuse to proceed** (STOP) if you cannot produce a real, non-empty entry for `NEWVERSION` —
     the changelog must be updated for every bump. If the working tree has no meaningful change to
     describe, that is a reason to stop, not to write a filler entry.

4. **Bump the version** (source of truth `app/package.json`; also updates `app/package-lock.json`):

   ```
   npm version <directive> --no-git-tag-version --prefix app
   ```

   For patch/minor/major pass the directive; for an explicit target pass `NEWVERSION`. Confirm the
   result equals `NEWVERSION`.

5. **Commit everything as one commit.** Stage all changes and commit with the message (or the
   auto-generated Conventional-Commits summary), ending the body with the trailer:

   ```
   git add -A
   git commit -m "<message>" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

6. **NO publish, NO tag push.** Do **not** build, push, or publish any image, and do **not** push a
   git tag — pushing `main` or a `v*` tag triggers `publish-app.yml`, and image release is not this
   command's job. You MAY create a *local* annotated tag `git tag -a vNEWVERSION -m "vNEWVERSION"`
   for local bookkeeping, but never `git push` it here. Report the new version, the commit, and the
   one-line changelog summary.
