# Forge Platform Capabilities — the wind-tunnel ledger

The counterpart to [PROJECT_IDEA.md](PROJECT_IDEA.md). That file tracks the **features** forge-os
builds. This file tracks the **platform capabilities those features force into existence** — the
generic machinery that should live in **Forge** and be shared across apps, not implemented fully
inside `./app`.

This is the point of the wind tunnel ([CLAUDE.md](CLAUDE.md) → *Why this project exists*): a
feature is only pulling its weight if the pressure it puts on the platform is **recorded and
routed to Forge**, instead of being quietly absorbed as app-local code.

> **This file is also a contract between two agents.** It is the *only* shared channel between
> the **platform-builder agent** (builds Forge capabilities in the Forge platform repo) and the
> **forge-os agent** (builds features here and simplifies `./app` onto new capabilities). They
> never talk directly — a **human relays** between them. Read *How this file works* before editing.

---

## How this file works — the two-agent loop

```
forge-os agent                     human (relay)                 platform-builder agent
──────────────                     ─────────────                 ──────────────────────
builds a feature, records the  ──▶ "here's the pressure"    ──▶  picks the next capability
pressure here (🟡/🔴 row)                                        (recommended sequence), builds it
                                                                 in Forge, fills the Delivery block,
                                                                 sets status 🟢, owner → forge-os
adopts it: refactors ./app     ◀── "capability N is ready"  ◀──  notifies human
onto the capability, deletes
the stopgap, fills the
Adoption block, sets ✅         ──▶ "adopted, N is done"     ──▶  (may build the next one)
```

Each capability has a **permanent ID** (`C1`, `C2`, …) — never renumber or reuse. Each moves
through a lifecycle; the **Owner** is whoever has the next action.

### Lifecycle & status legend

| Status | Meaning | Owner (next action) |
|---|---|---|
| 🔴 **Absent** | A real gap; forge-os can't do the thing at all (no stopgap). | platform-builder |
| 🟡 **Local stopgap** | Built inside `./app` because Forge lacks it; the app code is the reference spec. | platform-builder |
| 🔵 **In progress** | platform-builder is building it. | platform-builder |
| 🟢 **Ready for adoption** | Delivered in Forge; **Delivery block filled**; versioned. Not yet consumed. | forge-os |
| ✅ **Adopted** | forge-os refactored onto it; stopgap deleted; verified. | — (done) |
| ⛔ **Blocked / needs info** | Someone needs something before proceeding; see notes. | whoever must supply it |

### Edit discipline (so the two agents don't clobber each other)

- **platform-builder** edits: a capability's **status/owner**, its **Platform delivery** block, the
  **Runtime & version** table, and the **Handoff log**. Do **not** edit forge-os app code, specs,
  the *Refactors OUT* plan, or the *Adoption* blocks.
- **forge-os** edits: a capability's **status/owner** (on adoption), its **Adoption** block, the
  *Refactors OUT* plan, the evidence/metrics, and the **Handoff log**. Do **not** fill Delivery
  blocks.
- Both: append to the **Handoff log** on every state change, and **notify the human** at the end of
  your turn with *what changed* and *whose turn is next*.

---

## Requirements (non-negotiable)

Two rules bind **both** agents. These are **MUST**, not preferences — a turn that violates one is
incomplete and gets bounced ⛔.

### R1 · Pin every image — never `latest`

Reproducibility depends on exact versions:
- The platform-builder's **first required action** is to pin the current control-plane **baseline**
  to a concrete `tag @ sha256:digest` and record it under *Runtime & version → Baseline*, replacing
  today's `latest`. That pinned tag is the floor every capability builds on.
- Every capability's *Delivered in* field MUST carry a concrete `tag @ sha256:digest` (plus the app
  base-image tag if it changes). A delivery with `latest`, a bare tag, or no digest is **incomplete**
  — forge-os bounces it ⛔.
- On adoption, forge-os MUST pin that exact `tag @ digest` in `app/compose.yaml` / `FORGE_IMAGE` and
  record it under *Now runs on*. **No `latest` may appear in any adopted runtime config.**

### R2 · One capability per relay

Hand off **one** capability at a time, so each refactor stays small and verifiable:
- The platform-builder sets **exactly one** capability to 🟢 per relay, then stops and notifies the
  human. Do **not** batch multiple 🟢 hand-offs.
- forge-os drives that capability to ✅ (or bounces it ⛔) and notifies the human **before** the next
  one is handed over.
- Independent platform work may proceed in parallel, but **at most one capability sits in 🟢**
  awaiting adoption at any moment.

---

## What earns a row

A capability belongs here when it is **both** (1) **genuinely needed** by a shipped or imminent
forge-os feature, and (2) **generic** — it would serve any app, so its full implementation
belongs in the platform. Domain logic (Goals, Tasks, heat, streaks) stays in the app. Plumbing
(event logs, schedulers, model access, secrets, notifications) is a platform candidate. Do not
add unpressured, speculative capabilities — see *Deferred*.

---

## Instructions for the platform-builder agent

You are building these capabilities in the **Forge platform** (not in this repo — `./app` is a
black-box consumer). This file is your work queue and your handoff channel. For each capability:

1. **Work the recommended sequence** (below), but honor **dependencies** first (e.g. C4 needs C2 +
   C3). If you reorder, note why in the Handoff log.
2. **Treat the forge-os reference implementation as the behavioral spec.** The files/tables cited
   under *Reference implementation* are a working, verified example of the behavior. The
   *Required semantics* bullets are the **acceptance criteria** — the forge-os agent will verify
   exactly those before deleting its stopgap.
3. **Fill the Platform delivery block completely** using the field template in *What each side
   records*. Missing any field means the forge-os agent cannot adopt it — it will bounce the
   capability back as ⛔.
4. **Pin versions (R1).** Record the **control-plane image `tag @ sha256:digest`** (and app
   base-image tag, if it must change) that first provides the capability, in *Delivered in* and the
   *Runtime & version* table — and pin the baseline floor first. Never `latest` (see **R1**).
5. **Preserve graceful degradation.** When the capability is absent or unconfigured, the app must
   be able to *detect* that and degrade (not crash) — e.g. C5 must keep the "return 503 when no
   key" behavior expressible. Document how to detect absence.
6. **Update this file in the same change that ships the capability** — don't let the ledger drift
   from the platform. Set status → 🟢 and Owner → forge-os, append to the Handoff log, then **stop
   touching that capability** and notify the human. The forge-os agent takes it from there. Ship
   **one capability per relay** — never set more than one to 🟢 at a time (see **R2**).
7. **Don't invent capabilities.** Add a new `Cn` row only if a real forge-os need appears (or you
   split an existing one); keep the *What earns a row* / *Deferred* discipline. If you need
   something from forge-os to proceed, set the row ⛔ with Owner → forge-os and say what you need.

## Instructions for the forge-os agent (me, on adoption)

When the human says a capability is 🟢 Ready:

1. **Check the Delivery block is complete** against the field template. If a field I need is
   missing, set the row ⛔ Owner → platform-builder, list the gap in the Handoff log, and notify
   the human — do not guess.
2. **Bump the runtime** to the *Delivered in* version and apply the *Wire it in* steps (image tag
   in `app/compose.yaml`, any `./forge provision` flag, env, `package.json` dep). Pin the exact
   `tag @ digest` — never `latest` — and record it in *Now runs on* (see **R1**).
3. **Refactor `./app` onto the capability** per *Refactors OUT*: replace the stopgap with the
   documented client, **delete** the named tables/files/routes, keep the domain code.
4. **Validate + verify**: `./forge lint/build/test` green, then drive the real flow using the
   Delivery block's *Verify* call, and confirm **graceful degradation still holds**.
5. **Fill the Adoption block**, set status → ✅ Owner → —, update the evidence **metrics** (e.g.
   `lib/db.ts` line count), append to the Handoff log, commit, and notify the human.
6. If adoption reveals the capability is missing behavior, set ⛔ Owner → platform-builder with a
   precise repro, rather than re-growing a stopgap.

---

## What each side records — field templates

These templates define **exactly what information each agent must leave** so the other can act.

### Platform delivery block — *filled by platform-builder* (this is precisely what forge-os needs to refactor)

- **Delivered in** — control-plane image tag **and** digest + platform commit/PR ref. Note the app
  base-image tag too **iff** consuming it requires changing `app/compose.yaml`'s `node:22-…` image.
- **Consume it** — the exact interface the app calls, unambiguous enough to write against:
  - **mechanism**: npm package (name + version) / HTTP endpoint (method + path + how the base URL &
    auth reach the app) / injected runtime global / new `./forge <subcommand>` / env-provided.
  - **signatures + types**: request and response shapes (TypeScript types or JSON schema).
  - **failure modes**: every error/status it can return and what each means.
- **Wire it in** — everything the app runtime must change to use it: image bump (from → to), new
  `compose.yaml` service or env var, `./forge provision --<flag>`, `package.json` dependency, config
  file. If nothing changes, write **"no runtime change."**
- **Detect absence / degrade** — how the app tells the capability is unavailable/unconfigured, so
  graceful degradation keeps working (the replacement for today's in-app guards).
- **Verify** — a concrete call/command that proves it works end-to-end, with expected output, that
  the forge-os agent can run during its Verify step.
- **Data & migration** — does adoption need existing rows imported (e.g. `events`, `agent_runs`), or
  is a **clean cutover** fine? (For forge-os dev data, clean cutover is acceptable unless noted.)
  Give the import path if one is needed.
- **Compatibility / breaking** — does the image bump affect already-adopted capabilities, or require
  re-provision / re-install? Anything that could break an existing feature.

### Adoption block — *filled by forge-os*

- **Adopted in** — forge-os commit(s).
- **Now runs on** — the control-plane image tag/digest (and app image, if changed) the app is pinned
  to after adoption.
- **Deleted** — the tables / files / routes / deps removed (the debt paid down).
- **Kept (domain)** — what stayed in `./app` and why it's domain, not plumbing.
- **Verified** — the `build_…`/`test_…`/`check_…` ids + the end-to-end check run, incl. that
  graceful degradation still holds.
- **Metrics** — updated KPI(s), e.g. `lib/db.ts` line count before → after.

---

## Runtime & version compatibility

Both agents must agree on image versions so the app is reproducible and so we know, if the dev
image must change, exactly which capabilities and features are affected.

**Baseline today (no capability adopted yet):**
- **Control-plane image:** `ghcr.io/mardash-ai/forge-control-plane` (`FORGE_IMAGE`, currently
  `latest`). ⛔ **Per R1, the platform-builder must replace this with a concrete
  `tag @ sha256:digest` floor as its first action** — everything else pins against it.
- **App web image:** `node:22-bookworm-slim` — [app/compose.yaml](app/compose.yaml).
- **App db image:** `postgres:16-alpine`.

**Rule:** a feature's minimum image is the **max over the capabilities it has adopted**. If a
capability requires a newer image, that ripples to every feature that adopts it — this table is how
we see the blast radius before bumping.

| Cap | Delivered in (CP image tag @ digest / commit) | App runtime change? | Adopted in (forge-os commit) | App pinned to |
|---|---|---|---|---|
| C1 | _TODO (platform-builder)_ | _TODO_ | _TODO (forge-os)_ | _TODO_ |
| C2 | _TODO_ | _TODO_ | _TODO_ | _TODO_ |
| C3 | _TODO_ | _TODO_ | _TODO_ | _TODO_ |
| C4 | _TODO_ | _TODO_ | _TODO_ | _TODO_ |
| C5 | _TODO_ | _TODO_ | _TODO_ | _TODO_ |
| C6 | _TODO_ | _TODO_ | _TODO_ | _TODO_ |

---

## What this session built (the evidence)

Everything committed in the founding session (`32f6ef3`…`50f6941`), sorted into **domain** (stays)
vs. **platform-shaped** (should be lifted out):

| Feature (commit) | Persisted state added | App-local machinery | Verdict |
|---|---|---|---|
| Goals & Tasks (`32f6ef3`) | `goals`, `tasks` | `lib/goals.ts`, `lib/heat.ts` | ✅ domain — stays |
| Timeline (`e89b427`) | `events` (+2 idx) | `lib/timeline.ts`, `recordEvent`/`listEvents` in `lib/db.ts` | ⬆️ platform → **C3** |
| Time & Today (`a05e7c1`) | `tasks.due_date` | `lib/schedule.ts` (read-time bucketing) | ⬆️ pressure → **C2** |
| Reminders (`80f583f`) | `dismissed_notifications` | `lib/notifications.ts`, cold-goal + derive logic in `lib/db.ts` | ⬆️ platform → **C4** (needs **C2/C3**) |
| Planner Agent (`e25e631`) | `agent_runs` (+idx) | `lib/agent.ts` (SDK+key), `recordAgentRun`, `ANTHROPIC_API_KEY` wiring | ⬆️ platform → **C1** (+ **C5**) |

**Metric to drive down:** `lib/db.ts` is now **588 lines** (was 467 at the founding session; Habits
added its tables + read-time streak derivation). Only the `goals`/`tasks`/`habits` domain queries
should remain here — as C1/C3/C4 extract their tables and logic and C2 absorbs the read-time
derivations, this falls toward the domain core. Track it in each Adoption block.

**Forge today provides** build/run/provision/observe: `init · provision (+postgres/redis) · install
· build · test · lint · dev · inspect · explain · plan · logs`, a Dockerized runtime, and **Resource
+ Event recording at the platform level**. It does **not** yet expose an app-facing event log, a
scheduler, model/agent access, notifications, or secret management — so forge-os hand-rolled all
five. Two of them (**C1**, **C3**) are Forge *re-exposing primitives it already has internally*
(Resources, Events) one layer up to the app.

---

## Capabilities to build

Each capability keeps the same skeleton. *Reference implementation* + *Required semantics* are the
spec for the platform-builder; *Refactors OUT* is the forge-os plan; the *Platform delivery* and
*Adoption* blocks are the handoff slots (fill per the templates above).

### C1 · Agent runtime — model access + Agent Task / Artifact resources
**Status:** 🟡 Local stopgap · **Owner:** platform-builder

- **Needed by:** Planner (v3); every future agent (Researcher, Writer, Scheduler…).
- **Reference implementation (behavioral spec):** [app/lib/agent.ts](app/lib/agent.ts) (own
  `@anthropic-ai/sdk` dep + the API call), untrusted-output cleaning in
  [app/lib/planner.ts](app/lib/planner.ts), the `agent_runs` table + `recordAgentRun()` in
  [app/lib/db.ts](app/lib/db.ts) (an Agent Task record whose `result` is an Artifact), key wired
  through [app/compose.yaml](app/compose.yaml).
- **Required semantics (platform must satisfy; forge-os will verify):**
  - Invoke a model with a system prompt, user input, and an enforced **output schema** (structured
    output); return the parsed result.
  - Persist **every** run — success *and* failure — as a first-class record with: id, kind/label,
    status, model, the produced artifact (result), error, timestamp. Survives restart; queryable.
  - Model output is **untrusted**: the app must still be able to post-validate before use.
  - Absent/unconfigured model access is **detectable** so the app returns 503, never crashes.
- **Proposed contract (platform may refine):** `forge.agent.run({ capability, input, schema }) → {
  runId, model, artifact }`, with runs/artifacts stored as inspectable Forge resources.
- **Refactors OUT of forge-os once adopted:** delete the `agent_runs` table + `recordAgentRun()`;
  delete [app/lib/agent.ts](app/lib/agent.ts) and drop `@anthropic-ai/sdk` from `app/package.json`;
  `/api/goals/[id]/plan` becomes a thin `forge.agent.run` call. **Stays (domain):** the Planner's
  prompt + `cleanProposedTasks` policy and the `PlanTasks` review UI.
- **Platform delivery:** _TODO (platform-builder — use the field template)_
- **Adoption:** _TODO (forge-os)_

### C2 · Scheduler / background jobs — *(the hard blocker)*
**Status:** 🔴 Absent · **Owner:** platform-builder

- **Needed by:** Reminders (v2) to *push* alerts; **Habits (v4, shipped this iteration on the
  read-time stopgap)** for recurrence + streak resets.
- **Reference implementation:** none — nothing runs on a schedule. Two features work around it by
  deriving at read time: Reminders ([app/lib/db.ts](app/lib/db.ts) `listActiveNotifications` /
  `listColdGoals`; time bucketed in [app/lib/schedule.ts](app/lib/schedule.ts)), and **Habits**
  ([specs/habits/](specs/habits/)) — a streak's reset is computed on read in
  [app/lib/habits.ts](app/lib/habits.ts) (`computeStreak`) + `listHabits`, because there is no job
  to finalize a missed period or to warn before a streak breaks. This absence *is* the evidence, and
  Habits makes it sharp: a streak that resets "at midnight" cannot honestly be a read-time
  derivation forever.
- **Required semantics:**
  - Register **recurring** work (cron-like) and **one-shot/scheduled** work; it runs while no user
    is present.
  - Jobs are **durable and retryable**; a crash/restart doesn't drop scheduled work.
  - A job can call back into the app (or a capability) to do its work and record results/events.
  - Observable: the app (or `./forge inspect`) can see scheduled/last-run/next-run state.
- **Proposed contract:** app registers `{ schedule, target }`; Forge invokes `target` on cadence.
- **Refactors OUT once adopted:** Reminders' read-time derivation becomes a **scheduled job** that
  precomputes/pushes (C4 flips pull → push); **Habits** gains real period boundaries — a recurring
  job finalizes each period and can fire "about to break your streak" (via C4). The pure
  `computeStreak` rule stays; only the *finalize/notify at the boundary* moves to the scheduler.
- **Platform delivery:** _TODO (platform-builder)_
- **Adoption:** _TODO (forge-os)_

### C3 · Application event log / Timeline
**Status:** 🟡 Local stopgap · **Owner:** platform-builder

- **Needed by:** Timeline (v2); also the substrate Reminders reads for "cold goals."
- **Reference implementation:** the `events` table + indexes + best-effort `recordEvent()` /
  `listEvents()` in [app/lib/db.ts](app/lib/db.ts), typed & formatted in
  [app/lib/timeline.ts](app/lib/timeline.ts), read by `/api/events`.
- **Required semantics:**
  - **Emit** a typed domain event with a subject (goal/task) and a denormalized `data` snapshot.
  - Emit is **best-effort**: a failed emit must never break the mutation that triggered it.
  - **Query** a per-app feed newest-first, filterable by subject, with timestamps — durable across
    restart. (`cold goal` detection needs "latest event time per goal.")
- **Proposed contract:** `forge.events.emit(type, subject, data)` + a queryable feed.
- **Refactors OUT once adopted:** delete the `events` table + indexes + `recordEvent`/`listEvents`;
  every mutation calls `forge.events.emit`; `/api/events` becomes a thin proxy (or goes). **Stays
  (domain):** [app/lib/timeline.ts](app/lib/timeline.ts) presentation (`describeEvent`/`sparkKind`/
  heat mapping) consuming platform events.
- **Platform delivery:** _TODO (platform-builder)_
- **Adoption:** _TODO (forge-os)_

### C4 · Notifications — *(bundle with C2 + C3)*
**Status:** 🟡 Local stopgap · **Owner:** platform-builder

- **Needed by:** Reminders (v2). **Depends on:** C3 (event source) + C2 (to push).
- **Reference implementation:** derivation + the `dismissed_notifications` table in
  [app/lib/notifications.ts](app/lib/notifications.ts) / [app/lib/db.ts](app/lib/db.ts), surfaced at
  `/api/notifications` (+ `/dismiss`) and a nav badge.
- **Required semantics:**
  - Produce notifications from **conditions over events/state** (the app declares *which*
    conditions — e.g. overdue task, cold goal).
  - **Dismissible**, and dismissal **persists**; a derived notification that no longer applies
    disappears on its own.
  - Deliverable while the user is away (via C2), not only computed on read.
- **Proposed contract:** subscribe conditions → Forge produces/tracks notifications + dismissal.
- **Refactors OUT once adopted:** delete `dismissed_notifications` + the derive/dismiss logic; routes
  become thin clients over `forge.notifications`. **Stays (domain):** the inbox UI, the copy, and
  *which* conditions matter (expressed as subscriptions).
- **Platform delivery:** _TODO (platform-builder)_
- **Adoption:** _TODO (forge-os)_

### C5 · Secrets / credential management — *(quick win — already bit us)*
**Status:** 🔴 Absent · **Owner:** platform-builder

- **Needed by:** Planner (`ANTHROPIC_API_KEY`); anything calling a third-party API.
- **Reference implementation:** hand-wired compose interpolation + a gitignored
  [app/.env](app/.env.example) + a "503 when the key is absent" guard (`isPlannerConfigured()`). A
  real key **landed in the wrong, tracked file** this session — evidence the hand-rolled approach is
  a foot-gun.
- **Required semantics:**
  - App **declares** a required secret by name; Forge stores it **encrypted** and injects it into the
    runtime; it never lands in source or an image layer.
  - The app can **detect** whether a declared secret is present (to degrade gracefully).
- **Proposed contract:** declare `secrets: [ANTHROPIC_API_KEY]`; Forge injects; `./forge` sets them.
- **Refactors OUT once adopted:** remove the `ANTHROPIC_API_KEY=${…}` line from
  [app/compose.yaml](app/compose.yaml), the `app/.env` convention, and the `.env.example` doc.
  **Stays:** the graceful-degradation semantics (`isPlannerConfigured()`), sourced from the platform.
- **Platform delivery:** _TODO (platform-builder)_
- **Adoption:** _TODO (forge-os)_

### C6 · Standard health / telemetry contract — *(minor)*
**Status:** 🟡 Local stopgap · **Owner:** platform-builder

- **Needed by:** every app (compose healthcheck already assumes `/api/health`).
- **Reference implementation:** [app/lib/health.ts](app/lib/health.ts) + `/api/health` — boilerplate.
- **Required semantics:** a standard readiness/health contract the platform recognizes, so each app
  doesn't hand-roll one. Low priority; fold into Forge's platform-telemetry story.
- **Refactors OUT once adopted:** delete `lib/health.ts` + `/api/health` if the platform provides
  the healthcheck contract; otherwise leave as-is.
- **Platform delivery:** _TODO (platform-builder)_
- **Adoption:** _TODO (forge-os)_

---

## Recommended sequence

Build in this order unless dependencies dictate otherwise:

1. **C2 Scheduler** — the only 🔴 with *no* workaround for doing work; Habits makes it undeniable.
2. **C5 Secrets** — small, isolated, already caused a real incident; ship it as a quick win.
3. **C3 Event log** — foundational; C4 depends on it, and it re-exposes an existing Forge primitive.
4. **C1 Agent runtime** — highest leverage for the roadmap's next theme (more agents), but larger.
5. **C4 Notifications** — lands naturally once C2 + C3 exist; mostly a re-wiring.
6. **C6 Health** — opportunistic; only if it falls out of the telemetry work.

The single clearest success metric: **`lib/db.ts` shrinks back toward just `goals`/`tasks` queries**
as C1/C3/C4 extract their tables and logic into the platform.

---

## Deferred — not yet pressured

Build these when a feature *needs* them, not because the roadmap lists them:

- **Identity / auth / multi-user** — every feature to date lists "no auth" as an explicit non-goal.
- **Search / indexing** — flagged in [PROJECT_IDEA.md](PROJECT_IDEA.md); no feature demands it yet.
- **Offline sync · mobile shared resources · OAuth federation** — future; named in the project idea's
  pressure list, not yet exercised.

---

## Handoff log

Append one line per state change (newest last). `by` = role; `ref` = commit / PR / image tag.

| Cap | → Status | by | ref | note |
|---|---|---|---|---|
| C1–C6 | seeded 🟡/🔴 | forge-os | `097f144` | initial ledger from the founding session |
| — | protocol added | forge-os | `258c24b` | two-agent contract, templates, version table |
| — | requirements R1/R2 | forge-os | `c682343` | pin-every-image + one-capability-per-relay made MUST |

---

## How this stays honest

Keeping this ledger current is **step 6 of the `add-a-feature` skill**. When forge-os finishes a
feature, ask *what generic machinery did I just build inside `./app`?* — new platform-shaped code →
🟡 row (cite files); a wall Forge can't do → 🔴 row; a capability now consumed → ✅ and thin the
local code. A feature that adds **no** platform pressure is a signal it may be pure app surface, not
a wind-tunnel feature.
