# Feature: App footer

## Goal
Give every forge-os app page a quiet, site-wide footer that shows the app's current
version and attributes the platform ("Powered by Mardash Forge"), so the running app
always reports what it is and what it runs on.

## Acceptance criteria
- [ ] A `<footer>` renders at the base of the app's own (auth-gated) pages, in the
      forge-floor aesthetic (mono, muted `--ash`, aligned to the 860px column).
- [ ] The version renders as `v<X.Y.Z>`, read **dynamically** from `package.json`
      (not hardcoded) and inlined at build so it is correct in the built app.
- [ ] The rendered version equals `package.json`'s `version` and the latest
      `CHANGELOG.md` heading.
- [ ] "Powered by Mardash Forge" renders as **static text** (no link — the Mardash
      site isn't built yet), with the brand label isolated so it can become an
      `<a href>` in a one-line change later.
- [ ] Real footer semantics (`<footer>`), responsive, unobtrusive.

## Details
- Routes/pages: site-wide via the root layout (`app/app/layout.tsx`). Signed-out
  `/auth/*` pages are platform-served (proxied) and out of scope.
- Data: none persisted. Version from `app/package.json` via `app/lib/version.ts`.
- Non-goals: no link target yet; no per-page footer variants; not shown on the
  platform-served `/auth/*` or `/status` surfaces.
- Notes: the attribution lifts to the platform later (capability **C17**).
