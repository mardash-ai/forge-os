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

> **✍️ Write baton — `Holder: free`.** Only the named Holder may edit this file; the other
> agent waits for the human to pass the baton. This is the single-writer lock over the human relay
> (the two agents live in separate repos, so this token — not git — is what serializes writes).
> Rules:
> - **Hold before you write.** If you are not the Holder, do not edit — ask the human to pass you
>   the baton first. The human sets the Holder when relaying between agents.
> - **Re-read on take.** The instant the baton becomes yours, re-read this file fresh from disk;
>   never edit from an earlier/cached copy — state may have moved while it wasn't your turn.
> - **Patch, don't regenerate.** Make one logical change in place; never rewrite the whole file.
>   Commit to git (never a shared unversioned copy) so any residual race is a visible conflict, not
>   silent loss.
> - **Pass it or free it.** When your turn is done, set `Holder:` to the other agent (if handing
>   off) or `free` (if nothing is pending), and add a Handoff-log line noting the pass.
> - A delivery made before this baton existed is grandfathered; from here on, the baton governs.

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

### R3 · Classify every capability by plane (control-plane vs data-plane)

Forge intends two images: a **control-plane** image (developer/orchestration — today's `FORGE_IMAGE`,
carrying the build/test/lint + `provision`/`inspect` tooling and the Docker CLI) and a future
**data-plane** image (production/deploy runtime) that **will not ship developer dependencies**. So
every capability MUST declare **which plane its runtime dependency lives in**, so Forge knows which
image must carry it — and so a dev-only dependency never leaks into production, nor a production
runtime dependency get stranded in dev-only tooling:

- **control-plane** — needed only at dev/build/orchestration time (a supported build/test/lint
  framework, the `provision`/`inspect`/`explain` commands themselves). Never runs in production.
- **data-plane** — a dependency the **running app needs in production**: model access (C1), a
  scheduler (C2), an event store (C3), notifications (C4), an injected secret's *value* (C5), a
  provisioned Postgres/Redis. Must ship in the data-plane image.
- **both** — a capability with a control-plane management/dev surface *and* a data-plane runtime
  surface; say which part is which (e.g. **C5**: the `forge secrets set/list` CLI is control-plane;
  the encrypted store + runtime injection the app reads is data-plane).

Rule of thumb: if the **production** app breaks without it, it's data-plane; if only a build or a
`./forge` command would break, it's control-plane. The platform-builder declares the plane in the
Delivery block; forge-os records it on the row. This is **metadata for Forge**, not work forge-os
does — forge-os doesn't build the images and today runs only the control-plane image (so every pin in
*Runtime & version* is a control-plane pin; a data-plane column is added once that image exists, keyed
off this field). Note the seam: the `provision` *command* is control-plane, but the Postgres/Redis/
secrets it **provisions** are data-plane — classify the dependency, not the command that sets it up.

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
- **Plane** (R3) — `control-plane` / `data-plane` / `both`. Which image must carry this capability's
  runtime dependency, so Forge ships it in the right place and dev deps stay out of production. If
  **both**, name which surface is control-plane and which is data-plane.
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
- **Control-plane image:** `ghcr.io/mardash-ai/forge-control-plane` (`FORGE_IMAGE`), pinned floor
  **`0.1.1 @ sha256:b2ba103f183fc8e1923129c077611379fb7265f9d688f54d0e96309a754478b3`** (was
  `latest`). Every capability builds on this floor (R1).
- **App web image:** `node:22-bookworm-slim` — [app/compose.yaml](app/compose.yaml).
- **App db image:** `postgres:16-alpine`.

**Rule:** a feature's minimum image is the **max over the capabilities it has adopted**. If a
capability requires a newer image, that ripples to every feature that adopts it — this table is how
we see the blast radius before bumping.

**Plane note (R3):** every pin below is a **control-plane** pin — the only image forge-os runs today.
The `Plane` field on each capability records where its *runtime* dependency belongs; once Forge ships
a distinct **data-plane** image, the data-plane capabilities (C1–C4, C6, and C5's injection half)
each get their own pin here in a new column. Control-plane-only capabilities (build/test/`provision`)
never will.

| Cap | Delivered in (CP image tag @ digest / commit) | App runtime change? | Adopted in (forge-os commit) | App pinned to |
|---|---|---|---|---|
| C1 | _TODO (platform-builder)_ | _TODO_ | _TODO (forge-os)_ | _TODO_ |
| C2 | `0.4.0 @ sha256:9d216618…1a47` **multi-arch** (v0.4.0 / `42e5360`) | image bump + register jobs + add cron endpoint(s) | `95ba999` | `0.4.0 @ sha256:9d216618…1a47` |
| C3 | _TODO_ | _TODO_ | _TODO_ | _TODO_ |
| C4 | _TODO_ | _TODO_ | _TODO_ | _TODO_ |
| C5 | `0.2.0 @ sha256:924814d3…eb762` **multi-arch** (v0.2.0 / `5765c4a`) | image bump + re-provision (declare `--secret`) | `d2faf4d` | `0.3.0 @ sha256:8d0dea66…df05` (bumped via **P1**; ≥ 0.2.0, secrets unaffected) |
| C6 | _TODO_ | _TODO_ | _TODO_ | _TODO_ |
| C7 | `0.6.1 @ sha256:482bda5c…c61e` **multi-arch** (v0.6.1 / `0115e04`) | `forge deploy` replaces the app's rollout script; `make deploy` starts the control plane transiently | `d367099` | `0.6.1 @ sha256:482bda5c…c61e` |

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
**Status:** 🟡 Local stopgap · **Owner:** platform-builder · **Plane:** data-plane (the running app calls the model; control-plane only for *inspecting* runs)

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
**Status:** ✅ Adopted · **Owner:** — · **Plane:** data-plane (jobs execute in production with no user present)

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
- **Platform delivery:**
  - **Delivered in** — control-plane image
    `ghcr.io/mardash-ai/forge-control-plane:0.4.0 @ sha256:9d2166188eebc852f82d3f19f6d13674292e8bc6e6d641d4ca1a9ef311e71a47`
    — **multi-arch (`linux/amd64` + `linux/arm64`)**, platform `v0.4.0` / commit `42e5360`. **App base
    image unchanged** (`node:22-bookworm-slim`).
  - **Plane** (R3) — **data-plane**: the runtime dependency is the scheduler that fires jobs while the
    app runs, no user present. `forge schedule` / `forge jobs` / `inspect jobs` are the **control-plane**
    management + observability surface over it — classify the dependency, not the command (as with
    `provision` vs. the Postgres it provisions). **v1 seam:** the `scheduler-node` Implementation ticks
    *inside* the control-plane image (the only image today); when a data-plane image ships, the ticker
    moves there without changing this contract.
  - **Consume it** — a new `./forge` surface + one app HTTP endpoint per job:
    - **mechanism:**
      - *Register* (upsert, idempotent by name): `forge schedule --app <app> --name <kebab> --target
        <path> (--every <dur> | --cron "<expr>" | --at <iso>) [--method GET|POST] [--disabled]`.
      - *Remove*: `forge schedule --app <app> --name <kebab> --remove`.
      - *Observe*: `forge jobs --app <app>` (or `forge inspect jobs --app <app>`).
      - *Execution*: on cadence Forge calls `<method> http://<callback-host>:<web-host-port><target>` on
        the app; the app runs that route and does the work. The app must be **running** (`forge dev`) for
        a call to land. `<callback-host>` defaults to `host.docker.internal` (override
        `FORGE_APP_CALLBACK_HOST`); the port is the app's `infra.ports.web` (from **P1**) or manifest port.
      - (HTTP under the hood: `POST /capabilities/schedule-job {app,name,target_path,method,every|cron|at,remove}`.)
    - **signatures + types:**
      - `schedule-job` in `{ app; name: /^[a-z0-9][a-z0-9-]*$/; target_path: "/…"; method?:
        "GET"|"POST"=POST; every?; cron?; at? /* exactly one */; disabled?=false; remove?=false }` →
        `ScheduledJob` `{ id; type:"ScheduledJob"; app_id; name; schedule
        ("every:<dur>"|"cron:<expr>"|"once:<iso>"); target{method,path}; enabled; next_run_at;
        last_run_at?; last_status:"never"|"succeeded"|"failed"; run_count; fail_count }`.
      - Schedules: `--every` = `30s|5m|1h|24h|7d`; `--cron` = 5-field **UTC** `m h dom mon dow` (`*`,
        lists, ranges, `*/n`); `--at` = ISO instant (one-shot, self-disables after firing).
      - `inspect jobs` → `Inspection.data: Array<{ name, schedule, target, enabled, next_run_at,
        last_status, runs }>`.
    - **failure modes:** `schedule-job` → `422` (bad cron/interval, none-or-multiple of every/cron/at,
      missing target, one-shot already past), `404` (unknown app, or `--remove` of a missing job). A
      **callback failure** (app down / non-2xx) is retried with backoff up to 3×, then skips to the next
      fire — `last_status:"failed"` + a `JobRunFailed` fact. A bad tick never crashes the control plane.
  - **Wire it in** —
    1. Bump `FORGE_IMAGE` → `ghcr.io/mardash-ai/forge-control-plane:0.4.0 @ sha256:9d2166188eebc852f82d3f19f6d13674292e8bc6e6d641d4ca1a9ef311e71a47`.
    2. Add the app cron endpoint(s), e.g. `POST /api/cron/habits-finalize`, `POST /api/cron/reminders`
       — make them **idempotent** (they may fire again after a retry or restart).
    3. Register: `forge schedule --app <app> --name habits --cron "5 0 * * *" --target
       /api/cron/habits-finalize`; `forge schedule --app <app> --name reminders --every 15m --target
       /api/cron/reminders`. No `package.json` change. On Linux (not Docker Desktop) set
       `FORGE_APP_CALLBACK_HOST` so callbacks resolve.
  - **Detect absence / degrade** — the scheduler is **additive**: with no jobs registered (or an older
    image) the app behaves exactly as today — the read-time derivations still compute correct values on
    read. Graceful degradation = keep the read-time paths as the source of truth and let the scheduled
    endpoints *precompute/notify*; make those endpoints idempotent so a missed or double fire is safe.
  - **Verify** —
    ```
    forge schedule --app <app> --name ping --every 30s --target /api/cron/ping   # app records the hit
    forge dev --app <app>                        # app up so callbacks land
    forge jobs --app <app>                        # ping [every:30s] enabled, next=…
    # after ~1 tick:
    forge jobs --app <app>                         # ping last=succeeded runs>=1
    forge inspect events --app <app>               # JobRan facts
    forge schedule --app <app> --name ping --remove
    ```
    Expected: `/api/cron/ping` is hit on cadence; the job shows `succeeded` / `runs≥1`; a `--cron "0 0
    * * *"` job's `next_run_at` is the next UTC midnight; a malformed cron → 422; removal drops it.
  - **Data & migration** — **clean cutover.** No import; register jobs fresh. Keep the read-time
    derivations as a safety net until C4 flips pull→push.
  - **Compatibility / breaking** — **non-breaking, additive.** New capability; no adopted capability is
    affected. The control plane now runs an idle background ticker (no jobs → no work). Requires the
    `0.4.0` bump. Callbacks assume the app is reachable at `host.docker.internal:<web port>` (Docker
    Desktop / the arm64 dev host) — override `FORGE_APP_CALLBACK_HOST` elsewhere.
- **Adoption:** ✅ **Adopted.** Habits' streak reset now has a real period boundary: a durable
  UTC-midnight job finalizes each closed period and **persists** streak breaks — the boundary record
  read-time derivation could never produce. The pure `computeStreak` stays the source of truth; the
  scheduler adds the *history of when* streaks broke.
  - **Now runs on** — control plane
    `ghcr.io/mardash-ai/forge-control-plane:0.4.0 @ sha256:9d216618…1a47` (multi-arch; `linux/arm64`
    confirmed in the index before pinning), pinned in the **tracked** root `compose.yaml` default (no
    `latest`, per R1). App base image unchanged (`node:22-bookworm-slim`).
  - **Added (onto the capability)** — `POST /api/cron/habits-finalize` (idempotent boundary job);
    pure `endedPeriod()` + `finalizeStreak()` in [app/lib/habits.ts](app/lib/habits.ts); the
    `habit_streak_breaks` table + `finalizeHabitStreaks()` in [app/lib/db.ts](app/lib/db.ts) (records
    one marker per missed period that ended a live run, `UNIQUE(habit_id, period)` for retry-safety).
    Registered `forge schedule --name habits-finalize --cron "5 0 * * *"`.
  - **Kept (domain / safety net)** — `computeStreak`/`listHabits` read-time derivation unchanged, per
    *Detect absence / degrade*: with no job (or an older image) the app behaves exactly as before.
    **Deferred to C4:** the Reminders *push* job — a `/api/cron/reminders` now would only recompute
    already-derived state with nowhere to deliver it (that's the "C4 flips pull → push" half), so it
    isn't built until the notification channel exists.
  - **Verified** — `build_3177e1f8` / `check_01a7c706` (0 problems) / `test_135f606f` (**80/0**, +8
    finalize tests) green. End-to-end: registered the job at `--every 30s`, ran `forge dev`, and the
    scheduler fired the callback on cadence — `forge jobs` → `last_status:succeeded`, `runs:3`;
    `forge inspect events` → `JobScheduled` → `JobRunFailed` → `JobRan`×N (the one failure was a fire
    during a stale-`.next` window, and its recovery on the next tick proved the delivery's
    retry/record behavior). Re-registered at `--cron "5 0 * * *"` → `next_run_at` = next UTC `00:05`,
    confirming cron parsing. Idempotency: repeated fires returned `{recorded:0}` with no error or
    duplicate rows. Break-recording correctness is covered by the pure `finalizeStreak` unit tests
    (fabricating historical check-ins isn't possible through the API, which only checks in *now*).
  - **Metrics** — `lib/db.ts` **588 → 656** (+68): C2 is *additive* (a table + one finalize query),
    so it grows db.ts rather than shrinking it. The shrink metric belongs to C1/C3/C4, which extract
    existing tables; C2's win is moving derivation *timing* to a durable boundary, not removing code.
  - **Adopted in** — see the *Runtime & version* table (C2) and the Handoff log.

### C3 · Application event log / Timeline
**Status:** 🟡 Local stopgap · **Owner:** platform-builder · **Plane:** data-plane (app emits/queries at runtime; the control-plane `inspect events` is an observability surface over the same store)

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
**Status:** 🟡 Local stopgap · **Owner:** platform-builder · **Plane:** data-plane (notifications produced/delivered at runtime, incl. while the user is away)

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
**Status:** ✅ Adopted · **Owner:** — · **Plane:** both (the `forge secrets set/list` CLI is control-plane; the encrypted store + runtime injection the app reads is data-plane)

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
- **Platform delivery:**
  - **Delivered in** — control-plane image
    `ghcr.io/mardash-ai/forge-control-plane:0.2.0 @ sha256:924814d3a8c75119031ab3abd39cb2184bcaf4af2b18bce21357b419ff7eb762`
    — **multi-arch (`linux/amd64` + `linux/arm64`)**, platform `v0.2.0` / commit `5765c4a`. **App
    base image unchanged** (`node:22-bookworm-slim`) — no `app/compose.yaml` base-image change.
  - **Consume it** — a new `./forge` surface over the control-plane API (the Builder/agent calls
    these, not app code):
    - **mechanism:**
      - *Declare* a needed secret: `forge provision --app <app> --secret <NAME>` (repeatable) **or**
        add `"secrets": ["<NAME>"]` to `app/forge.app.json`, then re-provision. Re-provision
        regenerates `app/compose.yaml` with a Forge-managed `- <NAME>=${<NAME>:-}` env line.
      - *Set* (encrypted): `forge secrets set --app <app> --name <NAME> --value <v>` — or
        `--from-env [ENV]` to read from your shell without putting the value in history.
      - *List*: `forge secrets list --app <app>` (or `forge inspect secrets --app <app>`) — **names only**.
      - *Inject*: automatic at `forge dev` — Forge decrypts the values in memory and passes them into
        the app container; no app-side call.
      - (HTTP under the hood: `POST /capabilities/set-secret {app,name,value}`,
        `POST /capabilities/inspect {app,type:"secrets"}`,
        `POST /capabilities/provision-environment {app,secrets:[]}`.)
    - **signatures + types:**
      - `set-secret` in `{ app: string; name: string /^[A-Za-z_][A-Za-z0-9_]*$/; value: string /*non-empty*/ }`
        → `Secret` resource `{ id; type:"Secret"; app_id; name; status:"set"; algo:"aes-256-gcm";
        created_at; updated_at }` — **never** the value.
      - `inspect secrets` → `Inspection` with `data: Array<{ name: string; set: true }>`.
      - `provision` in gains `secrets?: string[]`.
      - In the running container each declared secret is a normal env var (`process.env.<NAME>`): the
        value if set, an **empty string** if declared-but-unset.
    - **failure modes:** `set-secret` → `422 invalid_input` (name not a valid env-var identifier, or
      empty value), `404 not_found` (unknown app). `inspect secrets` → `404` (unknown app). No path
      ever returns or logs the value.
  - **Wire it in** —
    1. Bump `FORGE_IMAGE` → `ghcr.io/mardash-ai/forge-control-plane:0.2.0 @ sha256:924814d3a8c75119031ab3abd39cb2184bcaf4af2b18bce21357b419ff7eb762`
       (multi-arch; pin the digest — no `latest`).
    2. Declare the key: `forge provision --app <app> --secret ANTHROPIC_API_KEY` (or add it to
       `forge.app.json` `secrets` and re-provision).
    3. Store it: `forge secrets set --app <app> --name ANTHROPIC_API_KEY --from-env ANTHROPIC_API_KEY`.
    No `app/package.json` change; no new compose service. *Optional:* set `FORGE_SECRETS_KEY` on the
    control-plane service for a stable off-disk master key (else a `0600` key file is generated under
    `.forge/secrets/`).
  - **Detect absence / degrade** — keep `isPlannerConfigured()` =
    `Boolean(process.env.ANTHROPIC_API_KEY?.trim())`. When unset, the compose line resolves to empty,
    so the var is present-but-empty → the existing **503** path holds and the app never crashes.
    `forge secrets list --app <app>` reports what's set without revealing values.
  - **Verify** —
    ```
    forge provision --app <app> --secret ANTHROPIC_API_KEY
    forge secrets set --app <app> --name ANTHROPIC_API_KEY --from-env ANTHROPIC_API_KEY
    forge secrets list --app <app>          # -> [{"name":"ANTHROPIC_API_KEY","set":true}]
    grep ANTHROPIC_API_KEY app/compose.yaml # -> `- ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}` (no value)
    forge dev --app <app>
    curl -sf -X POST http://localhost:3000/api/goals/<goalId>/plan   # -> 200 (a plan), not 503
    ```
    Then degradation: with **no** secret set (fresh app / before `secrets set`), the same POST returns
    **503** and the app stays up. The key never appears in `app/compose.yaml`, the image, or any
    tracked file; `.forge/secrets/vault-*.json` holds ciphertext only.
  - **Data & migration** — **clean cutover.** No import. Re-set the key once via `forge secrets set`
    (dev data). Abandon the old `app/.env` value — and **rotate it**, since a real key previously
    landed in a tracked file.
  - **Compatibility / breaking** — **non-breaking.** `generateCompose` adds secret lines only when
    secrets are declared, so apps declaring none are byte-for-byte unchanged; no already-adopted
    capability is affected (none yet). Requires a **re-provision + restart of `forge dev`** to pick up
    the compose line and injection; `build`/`test`/`lint` are unaffected (injection is at
    runtime/`dev`, where the Planner runs).
- **Adoption:** ✅ **Adopted.** The Planner's `ANTHROPIC_API_KEY` now lives in Forge's encrypted
  vault and is injected at `forge dev`; the app no longer carries the key. (The prior ⛔ arm64 block
  was resolved by the platform-builder's multi-arch republish — see the Handoff log.)
  - **Now runs on** — control plane
    `ghcr.io/mardash-ai/forge-control-plane:0.2.0 @ sha256:924814d3…eb762` (multi-arch), pinned in
    the **tracked** root `compose.yaml` default (no `latest`, per R1). App base image unchanged
    (`node:22-bookworm-slim`).
  - **Deleted (stopgap)** — the gitignored `app/.env` key file; the hand-wired `ANTHROPIC_API_KEY`
    comment in `app/compose.yaml` (the env line is now Forge-generated by `provision --secret`); and
    the `ANTHROPIC_API_KEY` doc block in `app/.env.example`.
  - **Kept (domain)** — `isPlannerConfigured()` unchanged; the 503-when-absent path is intact.
  - **Verified** — `build_1e7b791` / `check_b2324a5` (0 problems) / `test_2176901` (72/0) green.
    `forge secrets set` + `list` → `ANTHROPIC_API_KEY set:true`; the `.forge/secrets` vault holds
    **ciphertext only** and the key is in **no tracked file**. With `app/.env` deleted, `forge dev`
    → `POST /api/goals/<id>/plan` → **200** (a real `claude-opus-4-8` draft), proving the value is
    injected from Forge, not the old file. Degradation: outside injection the compose var resolves to
    `""` (`docker compose config`), driving the unchanged `isPlannerConfigured()` → **503** path (no
    crash).
  - **Metrics** — `lib/db.ts` unchanged (C5 is runtime/config, not DB); removed the `app/.env`
    secret convention and the hand-wired compose plumbing.
  - **Notes** — the delivery ships `secrets set`/`list` but **no `secrets unset`** (fine — not in the
    Required semantics; would enable a live "revoke → 503" demo later) — now tracked as **P2** under
    *Platform issues & requests*. The provision-drops-services / resets-host-port footgun hit here was
    filed as **P1 and is now ✅ fixed in 0.3.0** — `provision` converges from the persisted `infra`
    block, so a flag-less re-provision keeps Postgres + the `5433` remap and no manual re-apply is
    needed (the app has since been bumped `0.2.0 → 0.3.0`).
  - **Adopted in** — see the *Runtime & version* table (C5) and the Handoff log.

### C6 · Standard health / telemetry contract — *(minor)*
**Status:** 🟡 Local stopgap · **Owner:** platform-builder · **Plane:** data-plane (the readiness/health contract is exercised against the running app in production)

- **Needed by:** every app (compose healthcheck already assumes `/api/health`).
- **Reference implementation:** [app/lib/health.ts](app/lib/health.ts) + `/api/health` — boilerplate.
- **Required semantics:** a standard readiness/health contract the platform recognizes, so each app
  doesn't hand-roll one. Low priority; fold into Forge's platform-telemetry story.
- **Refactors OUT once adopted:** delete `lib/health.ts` + `/api/health` if the platform provides
  the healthcheck contract; otherwise leave as-is.
- **Platform delivery:** _TODO (platform-builder)_
- **Adoption:** _TODO (forge-os)_

### C7 · Deploy — zero-downtime rollout of the production stack
**Status:** ✅ Adopted · **Owner:** — · **Plane:** control-plane (the deploy *orchestration* — like `provision` — is driven from a control-plane-bearing host against a target; the app containers it rolls are data-plane, and prod itself runs no control plane)

- **Needed by:** every deployed app. **forge-os** ships to https://forge-os.mardash.ai behind Traefik;
  **forge-starter** is about to receive the same pipeline — copying the rollout into each app is the
  pressure this row captures (a generic Deploy behavior living as app code).
- **Reference implementation (behavioral spec):** forge-os's hand-authored production deploy, built +
  verified this session (commits `88f14e8` + `9148e86`) — [deploy/rollout.sh](deploy/rollout.sh) (the
  start-first roll: scale-up a new replica → wait-healthy → deregister the old from Traefik → drain →
  stop+remove), the Traefik `loadbalancer.healthcheck` labels + `stop_grace_period` in
  [compose.prod.yaml](compose.prod.yaml), and the `make deploy` sequence (reconcile `postgres` → roll
  `web` → reconcile `data-plane`). A live probe across the roll showed the **1–3s of hard 502s** from a
  plain `docker compose up -d` **eliminated** (worst case now: a single in-flight request per roll,
  which needs app-level `SIGTERM` draining to zero out — exactly the piece a platform capability should own).
- **Required semantics (platform must satisfy; forge-os will verify):**
  - **Start-first** — the new version is up and **healthy** before the old is removed; there is never a
    moment with zero healthy backends (no 502 window).
  - **Health-gated cutover + auto-rollback** — traffic shifts to the new version only once it passes a
    readiness check; a new version that never becomes healthy is discarded, the old keeps serving, and
    the deploy **fails loudly** (safe, automatic rollback).
  - **Graceful drain** — the old version is deregistered from the router and its in-flight requests are
    allowed to finish (app-level `SIGTERM` handling) before it is stopped — *true* zero dropped
    requests, not merely zero outage window.
  - **Reverse-proxy aware** — works behind a shared proxy (Traefik today) with no host-port publishing;
    ≥1 healthy backend is always routable throughout.
  - **Pinned, idempotent, observable** — deploys a specific image digest (R1); re-running converges; the
    deploy is a durable, inspectable record with an outcome.
- **Proposed contract (platform may refine):** `forge deploy --app <app> --host <target> [--image
  <ref@digest>]` → a **Deployment** Resource (returned `202` + observed via state/Events, per the Laws —
  long-running work returns a Resource, not a blocked call), emitting `DeploymentStarted` /
  `DeploymentCompleted` / `DeploymentRolledBack` facts. The rollout strategy is a platform
  **Implementation** (e.g. `deploy-compose-rollout`), never app code; the app declares only its routing
  intent (host rule) and readiness path.
- **Refactors OUT of forge-os once adopted:** delete [deploy/rollout.sh](deploy/rollout.sh) and the
  hand-authored `make deploy` rollout sequence; the Traefik healthcheck labels + `stop_grace_period`
  become platform-generated (as `provision` generates `compose.yaml`). **Stays (domain / intent):** the
  host rule (`forge-os.mardash.ai`), the readiness path (`/api/health`), and the app's `SIGTERM` drain
  handler (or the platform ships a standard one). `release/deploy.sh` (SSH transport, gitignored) stays
  operator-local until the capability owns remote targeting.
- **Platform delivery:**
  - **Delivered in** — control-plane image
    `ghcr.io/mardash-ai/forge-control-plane:0.6.1 @ sha256:482bda5ccbf88c9d8b163d18dc34b6655ae8988e77ca6c3b2bdb90ab2a98c61e`
    — **multi-arch (`linux/amd64` + `linux/arm64`)**, platform `v0.6.1` / commit `0115e04`. (Deploy
    shipped in `0.6.0`; `0.6.1` made `--app` a **soft label** — a deploy host needn't have run
    `forge init`.) App images unchanged.
  - **Plane** (R3) — **control-plane**: Deploy is orchestration (like `provision`), run from a
    control-plane-bearing host against the target Docker daemon. The prod RUNTIME still runs no
    control plane — a deploy starts one **transiently** (local socket), or targets a remote daemon
    with `--context`.
  - **Consume it** — a new `./forge` surface (the Builder/CI runs it, never app code):
    - **mechanism:** `forge deploy --app <app> [--service <s>=web] [--compose-file <f>=compose.prod.yaml]
      [--context <docker-context>] [--proxy-net <n>=proxy] [--no-pull] [--drain-seconds <n>=3]
      [--timeout-seconds <n>=120]`. It (1) reconciles every non-`--service` compose service in place
      (`up -d --no-deps`), then (2) rolls `--service` **start-first**: `up -d --no-deps --no-recreate
      --scale <s>=N+1` → wait until the new replica is Docker-`healthy` → `network disconnect
      <proxy-net>` the old → drain `--drain-seconds` → `stop`+`rm` old. A first deploy (service not yet
      running) just `up -d`s it. Reads `<compose-file>` at the **project root** (`workspaceDir`).
      (HTTP: `POST /capabilities/deploy {app,service,compose_file,context,proxy_net,pull,drain_seconds,timeout_seconds}`.)
    - **signatures + types:** input `{ app; service?="web"; compose_file?="compose.prod.yaml"; context?;
      proxy_net?="proxy"; pull?=true; drain_seconds?=3; timeout_seconds?=120 }` → `Deployment` `{ id;
      type:"Deployment"; app_id?; status:"succeeded"|"failed"; implementation:"deploy-compose-rollout";
      service; strategy?:"first-deploy"|"rolled"; context?; compose_file; reconciled_services:string[];
      old_container_ids:string[]; new_container_ids:string[]; started_at; finished_at?; duration_ms;
      log_path; error_summary? }`. Facts: `DeploymentStarted` → `DeploymentCompleted` (ok) |
      `DeploymentRolledBack` (failure).
    - **failure modes:** a new replica that never becomes healthy (or a scale-up/reconcile error) →
      the new replica is discarded (`rm -f`), the **old keeps serving**, `status:"failed"` +
      `DeploymentRolledBack` (automatic rollback — never a partial outage). Missing/invalid
      `compose_file` or unknown `--service` → `status:"failed"` with a clear `error_summary`. Image
      pull is **non-fatal** (cached images deploy). `--app` is a soft label (0.6.1) — no registered
      Application required.
  - **Wire it in** — bump `FORGE_IMAGE` → the pin above; deploy with `forge deploy --app <app>` from a
    host that runs the control plane and can reach the target daemon. **Delete** the app's hand-rolled
    `deploy/rollout.sh` + the rollout steps in `make deploy`; **keep** `compose.prod.yaml` (its Traefik
    `loadbalancer.healthcheck` labels + `stop_grace_period` are what the roll relies on).
  - **Detect absence / degrade** — an older `FORGE_IMAGE` without Deploy → `POST /capabilities/deploy`
    404s (unknown capability); the app keeps whatever deploy path it had. The roll itself degrades
    safely: no new healthy replica ⇒ old keeps serving (rollback), never zero backends.
  - **Verify** — `forge deploy --app <app>` while probing the public URL: **0 dropped requests** across
    the roll; `forge inspect events` shows `DeploymentStarted` → `DeploymentCompleted`; the served
    container id changed. Proven this session: a local 2-service stack rolled twice with the running
    count **never hitting 0** (start-first), and the source bash version showed **0 HTTP drops** live.
  - **Data & migration** — **none.** Operates on the existing compose stack + named volumes; nothing
    to import. Clean cutover from the hand-rolled script.
  - **Compatibility / breaking** — additive; no adopted capability affected. Requires the `0.6.1`
    bump. The deploy host must reach the target Docker daemon (local socket, or `--context` remote).
- **Adoption:** ✅ **Adopted** (forge-os, same session — the human compressed the relay). `make deploy`
  now starts the control plane transiently and runs `./forge deploy --app forge-os --proxy-net proxy`
  (rolls the LOCAL prod stack over the Docker socket); the hand-rolled `deploy/rollout.sh` is **deleted**
  — the platform owns the roll. Zero-downtime + auto-rollback behaviour is unchanged; only its *source*
  moved from an app script to the capability.
  - **Now runs on** — control plane `0.6.1 @ sha256:482bda5c…c61e` (`FORGE_IMAGE` in `.env`), started
    transiently by `make deploy`. App + data-plane images unchanged.
  - **Deleted (stopgap)** — `deploy/rollout.sh` (78 lines) + the postgres/web/data-plane rollout
    sequence in `make deploy`; both collapse to one `forge deploy` call.
  - **Kept** — `compose.prod.yaml` (Traefik `loadbalancer.healthcheck` + `stop_grace_period` — the
    capability relies on them); `release/deploy.sh` (SSH transport, unchanged).
  - **Verified** — the roll ALGORITHM: **live bash** = 0 HTTP drops across the roll earlier this
    session; **TS port** = container count never 0 across two local rolls. The forge-os **BOX path**
    (transient control plane + `forge deploy` on the box) was **verified by the human on the box
    (2026-07-06)** — it deploys end-to-end; the one-time control-plane image pull (keychain) is done.

---

## Recommended sequence

Build in this order unless dependencies dictate otherwise:

1. **C2 Scheduler** — the only 🔴 with *no* workaround for doing work; Habits makes it undeniable.
2. **C5 Secrets** — small, isolated, already caused a real incident; ship it as a quick win.
3. **C3 Event log** — foundational; C4 depends on it, and it re-exposes an existing Forge primitive.
4. **C1 Agent runtime** — highest leverage for the roadmap's next theme (more agents), but larger.
5. **C4 Notifications** — lands naturally once C2 + C3 exist; mostly a re-wiring.
6. **C6 Health** — opportunistic; only if it falls out of the telemetry work.
7. **C7 Deploy** — added late (the zero-downtime rollout built in forge-os this session). **The human
   has directed it be built next, ahead of C3**, to stop the deploy pipeline being copy-pasted per app
   (forge-starter is about to inherit it). A deliberate reorder — recorded here like P1 was.

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

## Platform issues & requests (for the platform-builder)

**Not** new capabilities — defects / UX gaps in **existing** Forge behavior that forge-os hit while
adopting. The platform-builder owns the fix; track these alongside capability work. These are
**control-plane** by nature (they're about the `./forge` tooling itself, e.g. `provision`), which is
exactly why the plane seam from R3 matters: `provision` is control-plane, but the Postgres/secrets it
manages are data-plane.

### P1 · `provision` is destructive (replace-from-flags, not additive) — ✅ fixed & verified in 0.3.0 · Owner: —
- **Hit during:** C5 adoption. `forge provision --app forge-os --secret ANTHROPIC_API_KEY` (without
  `--with-postgres`) **silently dropped the Postgres service** from `app/compose.yaml`; only a second
  provision with `--with-postgres --secret …` restored it. It also **resets** hand-applied host-port
  remaps (e.g. `5433:5432`).
- **Why it's dangerous:** `provision` regenerates `app/compose.yaml` from *only* the flags on that
  call, with no warning. Worst case is **data loss** (drop a volume-backed service, then a `down -v`
  / prune); common case is a suddenly-broken app. It's reachable from documented guidance too — the
  `provision-app` skill's recovery step used to advise a **flag-less** re-provision (now fixed in
  forge-os + forge-starter, but the platform behavior remains the root cause).
- **Also:** `app/forge.app.json` records scaffold metadata but **not** the desired infra
  (postgres/redis/secrets), so there's no persistent source of truth for provision to converge from.
- **Ask:** make `provision` **idempotent** — read the full desired environment
  (postgres/redis/secrets, ideally custom host ports) from `app/forge.app.json` and *converge*;
  and/or **preserve** existing services unless explicitly removed; and/or **refuse** to drop a
  service that owns a data volume without an explicit `--force`. Persist declared infra in
  `forge.app.json` so a re-provision needs no flags.
- **Fix delivered (0.3.0) — satisfies the Ask in full:** `provision` now **converges** the desired
  environment from `forge.app.json` (a persisted `infra` block) + *additive* flags. A flag-less
  re-provision never drops a service or resets a host-port remap; a data-volume service (Postgres)
  is refused (**422**) unless dropped with explicit `--force`; apps provisioned *before* this fix are
  recovered from their existing `compose.yaml` on the first re-provision (so migration is safe). New
  flags: `--without-postgres` / `--without-redis`, `--postgres-port` / `--redis-port` / `--web-port`,
  `--force`; `inspect app` surfaces the persisted `infra`.
  - **Delivered in:** `ghcr.io/mardash-ai/forge-control-plane:0.3.0 @ sha256:8d0dea6636acf6fda923ea8f354363e64e4fdce504b0f013ee5d4ca8b910df05`
    (multi-arch `amd64`+`arm64`; platform `v0.3.0` / commit `41494ae`).
  - **Adopt it:** bump `FORGE_IMAGE` to the pin above, then run `forge provision --app <app>` **once
    with no flags** — it recovers your current services from `compose.yaml` and writes the `infra`
    block; nothing is dropped. No app-code change.
  - **Verify:** `forge provision --app <app> --secret <X>` (no `--with-postgres`) keeps Postgres (the
    original footgun); `forge inspect app --app <app>` shows the persisted `infra`; `forge provision
    --app <app> --without-postgres` is refused **422** without `--force`.
  - **Verified (forge-os):** bumped the control plane `0.2.0 → 0.3.0 @ sha256:8d0dea66…df05`
    (multi-arch index confirmed to carry `linux/arm64` before pinning). A **flag-less** `forge
    provision --app forge-os` recovered the app's full environment into `forge.app.json`'s `infra`
    block — `{postgres:true, redis:false, secrets:[ANTHROPIC_API_KEY], ports:{web:3000,
    postgres:5433}}` — **nothing dropped**, and the hand-applied `5433` remap survived (it no longer
    needs manual re-application; Forge even regenerated `app/compose.yaml` without the old "re-apply
    after provision" comment). The three checks all held: (1) the original footgun — `provision
    --secret ANTHROPIC_API_KEY` with **no** `--with-postgres` — kept `services:[web,postgres]` at
    port `5433`; (2) `inspect app` surfaces the persisted `infra`; (3) `provision --without-postgres`
    was **refused** (`invalid_input`, the 422 code) with a data-loss message, requiring `--force`.
    The app now runs on `0.3.0`; the `provision-app` skill guidance (forge-os + forge-starter) was
    updated to describe the convergent behavior.

### P2 · Add `secrets unset` (C5 follow-up) — 🟡 minor
- **Context:** C5 shipped `secrets set` / `list` but no way to **remove/revoke** a secret. Not in the
  C5 Required semantics, so not a blocker — but without it there's no live "revoke → 503" path and no
  clean rotate-by-removing.
- **Ask:** add `forge secrets unset --app <app> --name <NAME>` (idempotent; `404` unknown app; never
  logs the value). Lets forge-os demonstrate graceful degradation live and supports clean rotation.

### P3 · Generated Postgres healthcheck probes a nonexistent db — 🟢 fixed in 0.5.1 · Owner: forge-os (bump + re-provision)
- **Context:** `generateCompose` (control plane) emitted `test: ["CMD-SHELL", "pg_isready -U forge"]`
  with no `-d`. `pg_isready` defaults the target db to the **user** name (`forge`) — but the db is the
  **app** name (`forge_os`), so for any app whose name ≠ `forge` the Postgres container logged a
  harmless-but-alarming `FATAL: database "forge" does not exist` every 10s. Surfaced by the forge-os
  prod deploy. (Prod `compose.prod.yaml` was hand-patched at the time; this fixes it **at the source**
  so every *generated* dev `compose.yaml` is correct too.)
- **Fix (0.5.1):** the healthcheck now names the db it already sets — `pg_isready -U forge -d <app>` —
  so the probe hits the real database and the FATAL spam stops. Regression test added
  (`tests/provision-converge.test.ts`). No behavior change beyond the probe target; the volume/data
  are untouched — a failing healthcheck never dropped data, it only wrote log noise.
- **Delivered in:** `0.5.1 @ sha256:f4987ac227c942c638e31ac8f559db36a8f593e2bd80face329b9c3288060f7d`
  **multi-arch** (amd64+arm64) · v0.5.1 / `9bdaa0f`.
- **Adopt (forge-os):** bump `FORGE_IMAGE` to the pin above and re-run `forge provision` (no flags — it
  converges via P1) to regenerate the dev `compose.yaml` with the fixed healthcheck. Verify:
  `docker compose logs postgres` shows **no** `FATAL: database "forge"`. Purely cosmetic (dev-log
  noise) and prod is already correct — safe to fold into your next turn rather than a dedicated relay.

---

## Handoff log

Append one line per state change (newest last). `by` = role; `ref` = commit / PR / image tag.

| Cap | → Status | by | ref | note |
|---|---|---|---|---|
| C1–C6 | seeded 🟡/🔴 | forge-os | `097f144` | initial ledger from the founding session |
| — | protocol added | forge-os | `258c24b` | two-agent contract, templates, version table |
| — | requirements R1/R2 | forge-os | `c682343` | pin-every-image + one-capability-per-relay made MUST |
| C2 | evidence sharpened | forge-os | `5b8b448` | Habits (v4) shipped on the read-time stopgap — reset needs a scheduler |
| — | baseline pinned | platform-builder | `0.1.1@sha256:b2ba103f…` | R1 first action: control-plane floor pinned off `latest` |
| C5 | → 🟢 ready | platform-builder | `v0.2.0` / `0b730b6` | Secrets delivered (encrypted store + runtime injection). Built out of Recommended order (C2 first) to de-risk the first full relay — C5 is the isolated quick win. |
| — | write-baton added | forge-os | `f413eb7` | single-writer lock over the relay; `Holder: forge-os` (C5 awaiting adoption). C5 delivery untouched. |
| C5 | → ⛔ blocked | forge-os | `0.2.0@e396a891` | image is `amd64`-only; dev host is `arm64` (0.1.x shipped arm64). Republish 0.2.0 multi-arch incl. `linux/arm64`, then re-deliver. Baton → platform-builder. |
| — | multi-arch CI | platform-builder | `5765c4a` | publish workflow now builds `linux/amd64`+`linux/arm64` (QEMU + buildx); all future images multi-arch. |
| C5 | → 🟢 re-delivered | platform-builder | `0.2.0@sha256:924814d3…eb762` | republished 0.2.0 multi-arch (amd64+arm64); *Delivered in* + Runtime table updated to the new index digest. ⛔ resolved — forge-os may clear the ⛔ in the C5 Adoption block on re-adopt. Baton → forge-os. |
| C5 | → ✅ adopted | forge-os | `d2faf4d` | Secrets adopted: key in Forge's encrypted vault, injected at `forge dev`; `app/.env` + hand-wired compose plumbing deleted; control plane pinned to `0.2.0@924814d3…`. Verified 200 draft with `app/.env` gone. Baton → platform-builder (next per sequence: **C2**). |
| — | platform feedback | forge-os | `546c9d5` | filed **P1** (`provision` destructive/replace-from-flags) + **P2** (add `secrets unset`); fixed the flag-less-reprovision trap in the provision-app skill (forge-os + starter). Under a one-turn baton grant; baton stays with platform-builder for C2 + P1/P2. |
| P1 | → 🟢 fixed | platform-builder | `0.3.0@sha256:8d0dea66…df05` | `provision` now converges (non-destructive): persisted `infra`, additive flags, `--force` volume guard, host-port + pre-fix-`compose` recovery. Prioritized ahead of C2 — data-safety footgun that recurs on every adoption. Baton → forge-os (bump + verify; then pass back for C2). |
| P1 | → ✅ verified | forge-os | `0.3.0@sha256:8d0dea66…df05` | bumped control plane `0.2.0 → 0.3.0` (arm64 in the index confirmed first). Flag-less re-provision persisted `infra` to `forge.app.json` (postgres + `ANTHROPIC_API_KEY` + `5433` remap recovered, nothing dropped). Footgun gone: `--secret`-only provision keeps Postgres; `--without-postgres` refused **422** without `--force`. Updated the provision-app skill (forge-os + starter) to the convergent behavior. Baton → platform-builder (next per sequence: **C2 Scheduler**). |
| — | requirement R3 | forge-os | `ac48e76` | added **R3 · classify every capability by plane** (control-plane / data-plane / both) + a `Plane` field on each row and in the delivery template; classified C1–C4 + C6 as data-plane, C5 as both, provisioning/build/test (+ P1) as control-plane. Under a one-turn baton grant from the human; baton stays with **platform-builder** (C2 + declare `Plane` on delivery going forward). |
| C2 | → 🟢 ready | platform-builder | `0.4.0@sha256:9d216618…1a47` | Scheduler delivered (**data-plane**, R3): durable recurring (interval + UTC cron) / one-shot jobs, HTTP callback into the app, retry-with-backoff + resume-on-restart, observable via `inspect jobs` + `JobRan`/`JobRunFailed` facts. Habits' streak reset + Reminders' push can now move off read-time derivation. Baton → forge-os. |
| C2 | → ✅ adopted | forge-os | `95ba999` | bumped to `0.4.0` (arm64 in index confirmed). Added idempotent UTC-midnight `POST /api/cron/habits-finalize` that persists `habit_streak_breaks` at the period boundary; pure `finalizeStreak` + 8 tests; kept read-time `computeStreak` as the source-of-truth safety net. Verified the scheduler fires on cadence (`runs:3` succeeded, `JobRan` facts, cron `next_run_at`=next UTC 00:05). Reminders push **deferred to C4** (no channel yet). `lib/db.ts` 588→656 (C2 is additive). Baton → platform-builder (next per sequence: **C3 Event log**). |
| P3 | → 🟢 fixed | platform-builder | `0.5.1@sha256:f4987ac2…60f7d` | generated Postgres healthcheck now names the db (`pg_isready -U forge -d <app>`) — was `-U forge` only, which probes a nonexistent db "forge" and spammed `FATAL` every 10s for any app whose name ≠ `forge`. Surfaced by the forge-os prod deploy (prod compose was hand-patched; this fixes the **source** so every generated dev compose is correct). Regression test added; no data ever at risk. Interrupt fix ahead of C3. Baton → forge-os (bump + re-provision to clear dev spam, or fold into next turn; then pass back for **C3**). |
| C7 | filed 🟡 | forge-os | `88f14e8`+`9148e86` | filed **C7 · Deploy** (zero-downtime rollout). The production deploy pipeline built in forge-os this session — start-first roll + Traefik health-gate + drain — is generic and about to be **copy-pasted into forge-starter**; recorded as platform pressure so Deploy becomes a real Forge capability apps *consume*, not duplicate. Live-verified the 1–3s of 502s are gone (residual: 1 in-flight request per roll → needs app `SIGTERM` draining, which the capability would own). Human directed it be built **next**, ahead of C3. Baton → platform-builder to deliver. |
| C7 | → 🟢 ready | platform-builder | `0.6.1@sha256:482bda5c…c61e` | Deploy delivered (**control-plane**, R3): `forge deploy` does the start-first roll (reconcile deps → new replica healthy → drain old out of Traefik → remove), auto-rollback if the new never gets healthy. Ports forge-os's proven `rollout.sh` into the platform (`deploy-compose-rollout`); apps **consume** it now. `0.6.1` made `--app` a soft label (a deploy host needn't have run `forge init` — surfaced adopting on the box). Verified: local 2-service roll, container count never 0; source bash = 0 HTTP drops live. Baton → forge-os. |
| C7 | → ✅ adopted | forge-os | `d367099` | `make deploy` now starts the control plane transiently + runs `forge deploy --app forge-os`; **deleted** `deploy/rollout.sh` (78 lines) + the rollout sequence in make deploy. `FORGE_IMAGE` pinned `0.6.1@482bda5c…`. Zero-downtime + auto-rollback behaviour unchanged; source moved app→platform. ⚠ Box path first run should be **supervised** (control-plane image needs a one-time pull). Human compressed deliver+adopt into one session. Baton → platform-builder (next per sequence: **C3 Event log**). |
| — | baton freed | platform-builder | `PLATFORM_CAPABILITIES.md` | C7 fully done (delivered + adopted). No ledger write is pending: the **C3** build happens in the *forge* repo, not here. Baton → **`free`** — platform-builder re-acquires it to write the C3 delivery block; forge-os may acquire it to record the supervised **box-deploy verification** in the C7 Adoption block. (Holding it during a build just blocks the other side for no reason.) |
| C7 | box path verified | forge-os | (human) | supervised box `make deploy` succeeded — the transient-control-plane + `forge deploy` path deploys forge-os end-to-end on the box. ⚠ caveat in the C7 Adoption *Verified* line cleared. Baton acquired for this one write, released → **`free`**. |

---

## How this stays honest

Keeping this ledger current is **step 6 of the `add-a-feature` skill**. When forge-os finishes a
feature, ask *what generic machinery did I just build inside `./app`?* — new platform-shaped code →
🟡 row (cite files); a wall Forge can't do → 🔴 row; a capability now consumed → ✅ and thin the
local code. For every row, also tag its **plane** (R3): would the **production** app break without it
(data-plane) or only a build / `./forge` command (control-plane)? A feature that adds **no** platform
pressure is a signal it may be pure app surface, not a wind-tunnel feature.
