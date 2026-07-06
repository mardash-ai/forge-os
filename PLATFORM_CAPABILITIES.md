# Forge Platform Capabilities — the wind-tunnel ledger

The counterpart to [PROJECT_IDEA.md](PROJECT_IDEA.md). That file tracks the **features** forge-os
builds. This file tracks the **platform capabilities those features force into existence** — the
generic machinery that should live in **Forge** and be shared across apps, not implemented fully
inside `./app`.

This is the point of the wind tunnel ([CLAUDE.md](CLAUDE.md) → *Why this project exists*): a
feature is only pulling its weight if the pressure it puts on the platform is **recorded and
routed to Forge**, instead of being quietly absorbed as app-local code.

## What earns a row

A capability belongs here when it is **both** (1) **genuinely needed** by a shipped or imminent
forge-os feature, and (2) **generic** — it would serve any app, so its full implementation
belongs in the platform. Domain logic (Goals, Tasks, heat, streaks) stays in the app. Plumbing
(event logs, schedulers, model access, secrets, notifications) is a platform candidate.

## Status legend

- 🔴 **Absent** — a real gap; forge-os works around it or can't do the thing at all.
- 🟡 **Local stopgap** — built inside `./app` because Forge doesn't offer it; a candidate to
  **lift into Forge**. The app code is the reference implementation.
- 🟢 **Provided by Forge** — the app consumes it; the local code is deleted or a thin client.

---

## What this session built (the evidence)

Everything committed this session (`32f6ef3`…`50f6941`), sorted into **domain** (stays) vs.
**platform-shaped** (should be lifted out):

| Feature (commit) | Persisted state added | App-local machinery | Verdict |
|---|---|---|---|
| Goals & Tasks (`32f6ef3`) | `goals`, `tasks` | `lib/goals.ts`, `lib/heat.ts` | ✅ domain — stays |
| Timeline (`e89b427`) | `events` (+2 idx) | `lib/timeline.ts`, `recordEvent`/`listEvents` in `lib/db.ts` | ⬆️ platform → **C3** |
| Time & Today (`a05e7c1`) | `tasks.due_date` | `lib/schedule.ts` (read-time bucketing) | ⬆️ pressure → **C2** |
| Reminders (`80f583f`) | `dismissed_notifications` | `lib/notifications.ts`, cold-goal + derive logic in `lib/db.ts` | ⬆️ platform → **C4** (needs **C2/C3**) |
| Planner Agent (`e25e631`) | `agent_runs` (+idx) | `lib/agent.ts` (SDK+key), `recordAgentRun`, `ANTHROPIC_API_KEY` wiring | ⬆️ platform → **C1** (+ **C5**) |

**The tell:** `lib/db.ts` is **467 lines** — but only the `goals`/`tasks` queries are domain. The
rest (event recording, cold-goal detection, notification derivation, agent-run recording) is
platform plumbing that landed in the app because it had nowhere else to go.

**Forge today provides** build/run/provision/observe: `init · provision (+postgres/redis) ·
install · build · test · lint · dev · inspect · explain · plan · logs`, a Dockerized runtime, and
**Resource + Event recording at the platform level**. **It does not yet expose** an app-facing
event log, a scheduler, model/agent access, notifications, or secret management — so forge-os
hand-rolled all five. Two of them (**C1**, **C3**) are Forge *re-exposing primitives it already
has internally* (Resources, Events) one layer up to the app.

---

## Capabilities to build — and what refactors out of forge-os

Ordered by recommended build sequence (see rationale at the end).

### C1 · Agent runtime — model access + Agent Task / Artifact resources — 🟡 local stopgap
- **Needed by:** Planner (v3); every future agent (Researcher, Writer, Scheduler…).
- **Built this session:** [app/lib/agent.ts](app/lib/agent.ts) (own `@anthropic-ai/sdk` dep + the
  API call), untrusted-output cleaning in [app/lib/planner.ts](app/lib/planner.ts), the
  `agent_runs` table + `recordAgentRun()` in [app/lib/db.ts](app/lib/db.ts) (an Agent Task record
  whose `result` is an Artifact), and the key wired through [app/compose.yaml](app/compose.yaml).
- **Build in Forge:** managed model access + first-class **Agent Task / Artifact / Run** resources
  (recorded exactly as Forge already records Resources/Events) + a capability-invocation
  primitive: `forge.agent.run({ capability, input, schema }) → { runId, artifact }`.
- **Refactors OUT of forge-os once built:**
  - delete the `agent_runs` table + `recordAgentRun()` → platform resource;
  - delete [app/lib/agent.ts](app/lib/agent.ts) and drop `@anthropic-ai/sdk` from
    `app/package.json`;
  - `/api/goals/[id]/plan` becomes a thin call to `forge.agent.run`;
  - **stays (domain):** the Planner's prompt + `cleanProposedTasks` policy and the `PlanTasks`
    review UI — *what* to draft and how the human accepts it is app logic.

### C2 · Scheduler / background jobs — 🔴 absent  *(the hard blocker)*
- **Needed by:** Reminders (v2) to *push* alerts; Habits (next) for recurrence + streak resets.
- **Built this session:** nothing can run on a schedule, so Reminders **derives at read time**
  ([app/lib/db.ts](app/lib/db.ts) `listActiveNotifications`/`listColdGoals`). Time is only ever
  *bucketed* on read ([app/lib/schedule.ts](app/lib/schedule.ts)); nothing recurs or fires.
- **Build in Forge:** cron-like triggers + durable, retryable jobs + workflow composition that
  apps register work against.
- **Refactors OUT once built:** the read-time notification derivation moves to a **scheduled job**
  that precomputes and pushes (C4 flips from pull to push); Habits' reset becomes a **registered
  recurring job**, not app code run opportunistically on request.

### C3 · Application event log / Timeline — 🟡 local stopgap
- **Needed by:** Timeline (v2); also the substrate Reminders reads for "cold goals."
- **Built this session:** the `events` table + indexes + best-effort `recordEvent()` /
  `listEvents()` in [app/lib/db.ts](app/lib/db.ts), typed & formatted in
  [app/lib/timeline.ts](app/lib/timeline.ts), read by `/api/events`.
- **Build in Forge:** `forge.events.emit(type, subject, data)` + a queryable per-app feed —
  Forge already records platform Resources/Events; this exposes the same primitive to the app.
- **Refactors OUT once built:**
  - delete the `events` table + indexes + `recordEvent`/`listEvents`; every mutation calls
    `forge.events.emit` instead;
  - `/api/events` becomes a thin proxy (or goes);
  - **stays (domain):** [app/lib/timeline.ts](app/lib/timeline.ts) *presentation* — the
    `describeEvent`/`sparkKind`/heat mapping — consuming platform events.

### C4 · Notifications — 🟡 local stopgap  *(bundle with C2 + C3)*
- **Needed by:** Reminders (v2).
- **Built this session:** derivation + the `dismissed_notifications` table in
  [app/lib/notifications.ts](app/lib/notifications.ts) / [app/lib/db.ts](app/lib/db.ts), surfaced
  at `/api/notifications` (+ `/dismiss`) and a nav badge.
- **Build in Forge:** "subscribe to events → produce notifications → deliver + track dismissal,"
  riding on C3 (event source) and C2 (to push while the user is away).
- **Refactors OUT once built:** delete `dismissed_notifications` + the derive/dismiss logic; the
  routes become thin clients over `forge.notifications`; **stays (domain):** the inbox UI, the
  copy, and *which* conditions matter (overdue, cold) — expressed as subscriptions.

### C5 · Secrets / credential management — 🔴 absent  *(quick win — already bit us)*
- **Needed by:** Planner (`ANTHROPIC_API_KEY`); anything calling a third-party API.
- **Built this session:** hand-wired compose interpolation + a gitignored
  [app/.env](app/.env.example) + a "503 when the key is absent" guard. A real key **landed in the
  wrong, tracked file** this session — direct evidence hand-rolled secret handling is a foot-gun.
- **Build in Forge:** an app **declares** a required secret; Forge stores it encrypted, injects it
  into the runtime, and keeps it out of source.
- **Refactors OUT once built:** remove the `ANTHROPIC_API_KEY=${…}` line from
  [app/compose.yaml](app/compose.yaml), the `app/.env` convention, and the `.env.example` doc;
  **stays:** the graceful-degradation semantics (`isPlannerConfigured()`), now sourced from the
  platform.

### C6 · Standard health / telemetry contract — 🟡 minor
- **Built this session:** [app/lib/health.ts](app/lib/health.ts) + `/api/health` — boilerplate
  every app repeats and that `compose.yaml`'s healthcheck already assumes. Low priority; fold into
  Forge's platform-telemetry story rather than build standalone.

---

## Recommended sequence

1. **C2 Scheduler** — the only 🔴 with *no* workaround for doing work; Habits makes it undeniable.
2. **C5 Secrets** — small, isolated, and already caused a real incident; ship it as a quick win.
3. **C3 Event log** — foundational; C4 depends on it, and it just re-exposes an existing Forge
   primitive.
4. **C1 Agent runtime** — highest leverage for the roadmap's next theme (more agents), but larger.
5. **C4 Notifications** — lands naturally once C2 + C3 exist; mostly a re-wiring.

The single clearest success metric: **`lib/db.ts` shrinks back toward just `goals`/`tasks`
queries** as C1/C3/C4 extract their tables and logic into the platform.

---

## Deferred — not yet pressured

Build these when a feature *needs* them, not because the roadmap lists them:

- **Identity / auth / multi-user** — every feature to date lists "no auth" as an explicit
  non-goal. No real pressure yet.
- **Search / indexing** — flagged in [PROJECT_IDEA.md](PROJECT_IDEA.md); no feature demands it.
- **Offline sync · mobile shared resources · OAuth federation** — future; named in the project
  idea's pressure list, not yet exercised.

---

## How this stays honest

Updating this ledger is a step in the **add-a-feature** skill. Finishing a feature, ask: *what
generic machinery did I just build inside `./app`?* Then: new platform-shaped code → add/update a
🟡 row (cite files); hit a wall → a 🔴 row; consumed a Forge capability → move it to 🟢 and thin
the local code. A feature that adds **no** platform pressure is a signal it may be pure app
surface, not a wind-tunnel feature.
