---
name: add-a-feature
description: Add or evolve a feature in this repo's single app (at ./app) using the spec-driven, design-first Forge workflow. Use whenever the human asks to add/build/implement a feature, capability, page, or API in the app. You write a short FEATURE spec (and a DESIGN spec for UI), implement under ./app following Forge conventions, validate in Docker via ./forge, and verify the behavior end-to-end. This skill is the source of truth for how features are built here.
---

# Add a Feature (spec-driven, design-first)

The way to build on Forge is **describe the outcome, not the implementation**, then let
the validation loop drive it to correct. You write a small *spec*; you turn it into code
that follows the conventions below; you validate it through `./forge` (in Docker) until
it's green; and you **verify the behavior end-to-end** before calling it done. You never
hand-run `npm`/`next`/`node`, and you don't read app source to check state — inspect via
`./forge`.

This skill owns the **authoring workflow**. It leans on two others:
- **`provision-app`** — the Forge mechanics (init / provision / install / build / test / lint /
  inspect / explain / dev). That skill is the authoritative runbook for those commands.
- **`frontend-design`** — the aesthetic direction for any UI you build (invoke it *before*
  writing UI, see step 2).

---

## The loop

```
1. Spec        → specs/<feature-slug>/FEATURE.md   (Goal + acceptance criteria)
2. Design (UI) → specs/<feature-slug>/DESIGN.md    (via the frontend-design skill; optional mockup)
3. Build       → write files under ./app following the conventions below
4. Validate    → ./forge lint / build / test   (Docker), self-heal via ./forge explain
5. Verify      → drive the real flow: dev server + exercise it (API calls, restart, screenshots)
6. Record      → update PLATFORM_CAPABILITIES.md with the platform pressure this feature created
7. Done        → lint/build/test green AND every acceptance criterion observably holds
```

A good spec is small but **unambiguous about "done"** — the acceptance criteria *are* the
definition of done, and they're what make first-try-correct possible.

---

## 1. Write the spec

Put it at `specs/<feature-slug>/FEATURE.md`. Only two things are required — **Goal** and
**Acceptance criteria**; everything else sharpens accuracy. If the human didn't write a
spec, infer one from their request. **Only stop to ask about choices that are hard to
reverse** — above all, *does this data need to survive a restart?* (that's the one thing
that forces a database). Don't ask about cosmetics.

```markdown
# Feature: <short name>

## Goal
<1–2 sentences: what a user can do, and why.>

## Acceptance criteria
- [ ] <observable behavior you can verify by hand — e.g. "POST /api/tasks with an empty
      title is rejected with 400">
- [ ] <...>

## Details (optional — include only what matters)
- Routes/pages: <e.g. /tasks page; GET & POST /api/tasks>
- Data: <entities + fields; SAY whether it must persist across restarts>
- Non-goals: <what NOT to build — the cheapest way to stop gold-plating>
- Notes: <constraints, edge cases, UI wishes>
```

Write acceptance criteria you could check by hand ("rejects empty titles with 400" beats
"handles bad input"), name the routes, and list non-goals.

For a larger feature you can seed a skeleton first: `./forge plan --app <name> --goal "…"`
returns proposed files + a capability sequence to turn into the spec.

## 2. Design first — for any UI-bearing feature

Before writing a single component, **invoke the `frontend-design` skill** and produce
`specs/<feature-slug>/DESIGN.md`: a compact token system (color, type, layout), a signature
element, motion, and voice — grounded in the subject, not templated defaults. For anything
the human will look at and keep, this is not optional; it's what keeps the app from reading
as generic.

- Optionally render an **interactive mockup as an Artifact** so the human can approve the
  direction before you build. (Fonts can't load from a CDN in an Artifact — fall back to a
  system stack; the *layout and any data-encoding* is the real thing to validate.)
- Get sign-off on the direction, then implement to the DESIGN spec exactly.
- Keep FEATURE.md and DESIGN.md consistent (same routes, same data model, same rules).

Skip this step only for non-visual features (pure API/logic) or truly static text.

## 3. Implement under ./app

Every repo is a **single app at `./app`** (Next.js App Router + TypeScript + Vitest, run in
Docker). Layout:

```
app/                      ← the app project root
  app/                    ← Next.js App Router
    <route>/page.tsx      ← a page (server component by default)
    api/<name>/route.ts   ← an API route  (dynamic: api/<name>/[id]/route.ts)
    components/*.tsx       ← 'use client' components for interactivity
    globals.css, layout.tsx
  lib/<name>.ts           ← REAL LOGIC lives here as pure functions
  tests/<name>.test.ts    ← Vitest, Node environment
```

Rules that make features build first-try and stay testable:

- **Put real logic in `app/lib/*.ts` as pure functions** (validation, formatting, state
  transitions, derived values). Keep pages/routes/handlers thin wrappers that call it.
  Tests run in a **Node** environment against `app/tests/**/*.test.ts`, so pure `lib/`
  functions are directly unit-testable — React components are not tested by default.
- **Cover the acceptance criteria and edge cases in `app/tests/`** (Vitest). Import only pure
  `lib/` modules from tests — never the DB layer — so tests need no database.
- **Return proper status codes** from API routes (e.g. 400 on invalid input, 404 on unknown
  id). Trim/validate input in a `lib/` function the route calls.
- **Path alias** `@/*` maps to the app root, so `@/lib/goals`, `@/app/components/HeatBar`.

### Persistence is opt-in

- **Default to an in-memory store** (simple; resets on restart — fine for local features).
- **Reach for Postgres only when the spec says data must survive a restart.** Then:
  `./forge provision --app <name> --with-postgres`, and put the DB access in a thin
  `app/lib/db.ts` **separate from the pure logic** (so tests stay DB-free). Patterns that
  work here:
  - Connect with `new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://forge:forge@postgres:5432/<db>' })`.
    The web container reaches Postgres at host `postgres:5432` on the compose network; the
    fallback matches the provisioned credentials (`forge`/`forge`, db from `.env.example`).
  - **Create tables lazily** with a memoized `ensureSchema()` running `CREATE TABLE IF NOT
    EXISTS …` on first query — there's no migration step. `gen_random_uuid()` is built into
    Postgres 16, no extension needed.
  - **Mark DB-backed pages `export const dynamic = 'force-dynamic'`** so `next build` doesn't
    try to connect while prerendering. API route handlers are dynamic already.
  - **Guard malformed ids** (e.g. non-UUID) in the DB layer and return `null` → the route
    answers 404, not a 500.
  - Add a dependency by editing `app/package.json` then running `./forge install` — **never**
    `npm install` on the host.

## 4. Validate through Forge (in Docker)

Use the `provision-app` skill's contract. Branch on the JSON `.status`, not the exit code:

```bash
./forge lint  --app <name>
./forge build --app <name>
./forge test  --app <name>
```

On any `"failed"`, run `./forge explain --resource <id>`, fix **only** the files it names
(they're `path:line` under `./app/`), and re-run. Confirm the surface area with
`./forge inspect routes --app <name>` — don't read the whole repo.

**Definition of green:** `lint` = 0 problems, `build` = succeeded, `test` = succeeded (0 failed).

> Editor "Cannot find module 'next'/'react'/'@/lib/…'" diagnostics on the host are **false
> positives** — `node_modules` lives in the Docker volume, not on the host. Trust
> `./forge build`/`lint`, not the host TS server.

## 5. Verify the behavior end-to-end

Green is necessary, not sufficient — unit tests don't exercise the API, persistence, or UI.
Drive the real flow:

```bash
./forge dev --app <name>                     # start the dev server (Docker)
curl --retry 20 --retry-all-errors -sf http://localhost:3000/api/health   # wait for health
# …exercise each acceptance criterion: create/list/edit via curl, assert status codes…
./forge dev --app <name> --stop              # free the port when done
```

- **If data must persist:** create some, **stop and restart the dev server**, and re-fetch —
  the data must still be there. Unit tests can't prove this.
- **For UI:** drive it with the Playwright tools and screenshot the key screens — confirm the
  DESIGN spec actually rendered (fonts, the signature element, states).
- **Local gotcha:** if `./forge dev` fails with "port is already allocated" for `5432`,
  another project on the machine holds Postgres's host port. The app talks to Postgres
  *internally* (`postgres:5432`), so remap only the **host** port in `app/compose.yaml`
  (e.g. `5433:5432`) — don't stop the other project's database.

## 6. Record the platform pressure

forge-os is the **wind tunnel for Forge** (see `CLAUDE.md`), so a feature isn't done until the
pressure it put on the platform is captured. Update **`PLATFORM_CAPABILITIES.md`**: ask *what
generic machinery did I just build inside `./app`?* Then —

- new platform-shaped code (an event log, a scheduler shim, model wiring, a secrets hack, a
  notifications store) → add or update a 🟡 row, **citing the files**, so the extraction is real;
- hit a wall Forge can't do → a 🔴 row;
- consumed a Forge capability that now exists → move it to 🟢 and thin the local code.

Keep domain logic (the app's own resources and rules) out of the ledger — only generic,
shareable machinery earns a row. A feature that added **no** platform pressure is a signal it may
be pure app surface rather than a wind-tunnel feature — say so.

## 7. Done

Report success only when lint/build/test are green **and** you've observed every acceptance
criterion holding in the running app. Note the `build_…`/`test_…`/`check_…` ids. Commit the
spec (`specs/<feature-slug>/`) and the `PLATFORM_CAPABILITIES.md` update alongside the code under
`./app/`.

---

## Tips

- Keep features small — one coherent capability per spec; chain specs for a big goal, each
  green before the next.
- Say what it does, not how — skip file names/libraries in the spec unless a specific choice
  is a real requirement.
- Let logic live in `lib/`. It's what makes the feature testable and the build reliable.
- When in doubt, start bare-bones (a Goal + one checkable criterion) and let the validation
  loop and `./forge explain` guide the rest.
