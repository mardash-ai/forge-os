# Forge OS — Vision, Status & Feature Backlog

> **What this document is.** The single source of truth for forge-os's *product* direction: the
> vision, what's actually built (with versions), the competitive landscape it plays in, and a
> concrete, spec-ready backlog of what to build next. An agent should be able to open this, pick a
> feature (or the recommended *next set*), and go straight into the **`add-a-feature`** skill without
> further discovery.
>
> **Two orthogonal tracks — don't confuse them.** This doc tracks **product features** (`v1`, `v2`, …
> — what a *user* can do). Platform capabilities (`C1`, `C2`, … — the generic machinery Forge
> provides) are tracked in [PLATFORM_CAPABILITIES.md](PLATFORM_CAPABILITIES.md). They move
> independently: every product feature *presses* on the platform (the wind tunnel), but shipping a
> feature and adopting a capability are different acts. Release history for both lives in
> [CHANGELOG.md](CHANGELOG.md).

---

## 1. Why forge-os exists — the wind tunnel

forge-os is **not just a demo — it is the wind tunnel for Forge.** Every new Forge capability should
exist because *this application genuinely needs it* — not because the architecture says it should.
That mirrors how durable platforms actually grew: Git was built to run Linux-kernel development,
Kubernetes to run Google's workloads, Stripe's internal platform to support real products. The app
should continuously pressure Forge to become a better platform.

**Design constraints** (the reason forge-os keeps growing where a todo/kanban/chat demo would
"finish"):

1. Genuinely useful · 2. Open source · 3. Understandable by anyone · 4. A rich domain model ·
5. Requires both frontend and backend · 6. Naturally exercises AI agents · 7. Keeps growing for
years · 8. Makes sense as **both a web and iOS app**.

**The litmus test.** Every week, Forge should need another capability because the application
encountered a *real* problem — not because a roadmap says so. The backlog in §5 is deliberately
chosen so that each feature forces a specific, nameable Forge capability into existence.

---

## 2. The domain model

Forge OS is **the system that helps you run your life.** Everything revolves around **Goals**, and
the app's own model deliberately mirrors Forge's:

```
Builder → Goal → Capabilities → Resources → Events
```

The three catalogs below are annotated with live status. Legend: ✅ built · 🟡 partial · ⬜ not yet.

**Resources**

| Resource | Status | Notes |
|---|---|---|
| Goal | ✅ v1 | title, description, status (active→achieved→archived), derived progress |
| Task | ✅ v1 | belongs to a Goal, `done`; `dueDate` added v2 |
| Timeline Event | ✅ v2 | emitted at every mutation; stored in the platform event log (C3) |
| Notification | ✅ v2 | derived (overdue task, cold goal); stored in the platform store (C4) |
| Habit | ✅ v4 | daily/weekly, per-period check-ins, streak-as-heat |
| Agent Task | ✅ v3 | a persisted agent run; platform-owned via C1 |
| Artifact | ✅ v3 | an agent's produced result; platform-owned via C1 |
| **User / Account** | ✅ v0.7 | identity **shipped** (C10, `0.6.0`) **and** per-user *ownership* **shipped** — every resource is owner-scoped and users are fully isolated (§5 Epic M · M2 / C11, adopted `0.7.0`) |
| **Project** | ✅ v5 | group related Goals + roll up task-weighted progress/heat across members; add/remove goals; archive (goals survive — the FK is nulled). Owner-scoped like every resource. Shipped `0.14.0` |
| **Area** | ✅ v6 | a user-defined **life domain** (Health/Career/Finance/…); tag a Goal, Habit, or Project to ≤1 Area, then **filter every list view** by it. Deleting an Area keeps the tagged resources (the FK is nulled). Owner-scoped like every resource. Shipped `0.15.0` |
| **Document / Note** | ✅ v7 | markdown notes with **file attachments on the platform blob store (C20)**; linkable to a Goal/Project (FK nulled, never cascade-deleted); indexed into C19 Global Search. Owner-scoped. Shipped `0.18.0` (§5 Epic B · B1) |
| **Idea** | ⬜ | lightweight capture, promotable to Goal/Task |
| **Journal** | ⬜ | daily entries + reflection (§5 Epic C) |
| **Meeting** | ⬜ | with a Meeting Assistant agent (§5 Epic F) |
| **Contact** | ⬜ | personal-CRM relationships (§5 Epic G) |
| **Decision** | ⬜ | a decision log (§5 Epic H) |

**Capabilities** — Plan ✅ · Notify ✅ · Schedule 🟡 (due dates + Today + a background cron; no
calendar/auto-scheduling) · Generate 🟡 (only task proposals) · Prioritize 🟡 (implicit ordering
only) · Review 🟡 (human accept/reject of proposals) · Organize 🟡 (goal lifecycle **+ Projects**
(group related Goals and roll up their heat, `0.14.0`) **+ Areas** (tag Goals/Habits/Projects to a
life domain and filter by it, `0.15.0`); no sub-goals yet) · Research ⬜ · Write ⬜ ·
Summarize ⬜ · **Search ✅** (**Global Search** across Goals, Tasks, Projects, Areas & Habits — one
box, ranked typed results with `<mark>` snippets, owner-scoped; built on the platform's **C19**
full-text index, `0.17.0`).

**Agents** — Planner ✅. Researcher ⬜ · Writer ⬜ · Scheduler ⬜ (note: a C2 *background job*
finalizes streaks, but there is no AI Scheduler agent) · Meeting Assistant ⬜ · Career Coach ⬜ ·
Finance Assistant ⬜ · Travel Planner ⬜.

---

## 3. Implementation status — where we actually are

**Current app version: `0.18.0`** (SemVer in `app/package.json` / [CHANGELOG.md](CHANGELOG.md)). Twelve
pages, twenty-seven API routes, Postgres-persisted, Next.js App Router + TypeScript + Vitest (plus a
read-only **prod smoke suite**, run separately — see below). The newest surface is **Notes** (`/notes`,
`0.18.0`, **B1**) — markdown notes with **file attachments on the platform blob store (C20)**, linkable to
a Goal/Project and indexed into C19 search; before it, **Global Search**
(`/search`, `0.17.0`, **B5**) — one box across Goals, Tasks, Projects, Areas & Habits, backed by the
platform's **C19** owner-scoped full-text index: rows are indexed on mutation, a "reindex my data"
action backfills pre-existing rows, and results are ranked, typed, and `<mark>`-highlighted. Before it,
**Areas** (`/areas`, `0.15.0`) — user-defined life domains you tag Goals, Habits & Projects to (≤1 each) and
then **filter every list view** by; deleting an Area keeps the tagged resources (the FK is nulled).
It builds directly on **Projects** (`/projects` + a project detail view, `0.14.0`) — group related
Goals and see their combined heat. The primary **site nav is responsive**
(`0.12.2`): below the 768px tablet breakpoint the full row of options collapses into a tap-to-open
**"Menu"** button (a `<button>` with `aria-expanded`, Escape/outside-click to close), so on phones
nothing runs past the right edge and the page never scrolls sideways; tablet-and-up is unchanged. Projects,
Areas and the mobile-nav fix are **live in production**. Runs on the Forge platform with the
control-plane at **`0.26.4`** and the data-plane at **`0.26.4`** (both digest-pinned; multi-arch). The
**`0.26.4` data-plane roll (`0.16.0`) brings three newly-delivered platform capabilities' endpoints live**:
operator-declared **status incidents** now render on the public `/status` (+ `/status.json`) with **no app
code** — the existing proxy just gains an incidents section, byte-identical when none exist (**C15 · P3**);
generic **owner-scoped full-text search** (`POST /search` + `/index`·`/index/delete`·`/reindex`, **C19**); and
**owner-scoped blob storage** (`POST /blobs` · `GET/DELETE /blobs/:id`, **C20**). The search + blob **endpoints
are live server-side now** (reached via `FORGE_EVENTS_URL`). The first C19 consumer has now shipped: **B5 ·
Global Search** (`0.17.0`) indexes every Goal/Task/Project/Area/Habit on mutation, backfills existing rows via a
"reindex my data" action, and adds a `/search` UI (ranked, typed, `<mark>`-highlighted results that link back
to each resource). The second platform-consumer feature has now shipped too: **B1 · Notes / Documents**
(`0.18.0`) — markdown notes with **file attachments on the platform blob store (C20)** (app-proxied
`POST /blobs` upload + an auth-checked owner-scoped serve proxy `GET /api/blobs/:id` + owner-scoped delete,
15 MB / image+doc allowlist), linkable to Goals/Projects, and indexed into **C19** search so they appear in
Global Search. **Both the search (C19) and blob-storage (C20) endpoints now have a live consumer.** The `./forge`
wrapper dials the in-container API on the IPv4 literal `127.0.0.1` so it never misdials IPv6 `::1` (**P20**), and
it now **always polls `/health` before exec'ing the CLI** so a cold-start container bind can't race the `make up`
→ `forge release` handoff (**P22**). The deploy control-plane moved off the `0.24.1` stopgap to `0.26.2`, which
fixes the earlier `0.26.x` boot regression so the API binds + serves on the box (**P21**) and carries the complete
P20 CLI dial fix (`resolveApiBaseUrl` → `127.0.0.1` everywhere) — retiring `0.24.1`'s residual `localhost`→`::1`
CLI misdial. **Deploys are now ONE command — `forge release`
(C18, adopted `0.13.0`, forge `0.23.0`; the pipeline hardened to forge `0.24.1` which resolves the app leniently from
`app/forge.app.json` so a real release runs on a store-less production box — **P19**).** `make deploy` is
a thin call to `forge release --app forge-os --host
forge-os.mardash.ai …` that runs the whole pipeline as five ordered, **atomic + idempotent + fail-safe**
phases — **assess → publish → repin → deploy → verify** — retiring the ~10-step by-hand
publish→wait→resolve→repin→deploy→verify flow. Any phase that throws stops before the next (never
half-applied), a failed roll keeps the last-good replica serving, a red verify fails the release, a
dirty tree is refused before any mutation, and a re-run **resumes** from the first unsatisfied phase (a
landed re-run is a no-op); `--dry-run` previews the plan mutating nothing. Underneath: `0.19.0` hardened
the deploy path (a **drift gate** that fails loudly on a stale/absent image, plus force-recreate onto the
pinned digest — the deploy self-verifies) and simplified the C16 theme (below); **`0.22.0`** makes the
prod stack **fail loud on a missing/empty `AUTH_SESSION_SECRET`** (`${AUTH_SESSION_SECRET:?…}` on `web` +
`data-plane`) so a deploy can no longer silently rotate the session-signing key and log everyone out (the
**P17** logout-on-deploy fix), ships `forge verify` (a post-deploy contract smoke — the platform form of
C14, now the release's final gate), and turns on the **C15 uptime sampler** (`FORGE_STATUS_SAMPLE=1`) so
`/status.json` carries a rolling `uptime` section. The `./forge` wrapper also now forwards `--`-style
flags to the CLI (the **P16** `make deploy` fix).

> **🎨 Branded, and it ships a public status page.** The platform-served surfaces now wear forge-os's own
> look, not a neutral default — a root `forge.theme.json` (derived from the app's committed dark
> "forge floor" palette: slag/iron surfaces, forge-orange primary, amber/heat accent, Instrument Sans)
> paints the hosted **auth** pages (`/auth/*`) and the new status page in `--forge-*` tokens (**C16**,
> adopted `0.9.0`, forge `0.18.0`). Forge `0.19.0`'s C16 fix makes the base `colors{}` the *entire* dark
> palette for a pinned `mode:"dark"`, so the theme's redundant `dark{}` mirror block was **dropped**
> (`0.10.1`) — the render is byte-identical (`--forge-color-bg:#16120e`, dark surfaces/text unchanged).
> A **public `/status`** (+ `/status.json`) — proxied same-origin to
> the data-plane and reachable with **no login** — aggregates the app's own `/api/health` (**C15**),
> so an outage is visible without signing in. As of the `0.26.4` data-plane (`0.16.0`) it also renders
> **operator-declared incidents** (active + recent, with a banner floor) via the platform CLI
> (`forge status incident create/update/resolve/list`) — still **no app code**, byte-identical when
> none are open (**C15 · P3**).

> **🔎 Production smoke suite (app-local first cut of C14).** A small, strictly **read-only /
> non-destructive** HTTP suite validates the *deployed* app end-to-end: `/api/health` (public, C6
> schema), the unauth login-gate redirect (`/` → `/auth/login?next=%2F`), `/auth/config` +
> `/auth/login` (both methods present), the session/service gates (`/api/goals`, `/api/today` → 401;
> `/api/cron/*` → 403), `POST /auth/refresh` → 401 (no side effect), and the public `/status` +
> `/status.json`. It runs **outside** the hermetic offline unit run (`./forge test`) because it needs
> outbound internet: `npm --prefix app run smoke:prod` (host-run vitest via `app/vitest.smoke.config.ts`
> over `app/tests/smoke/prod.smoke.ts`). Target host from **`SMOKE_URL`** (fallback `BASE_URL`),
> defaulting to `https://forge-os.mardash.ai`, so the same suite can point at dev/staging. Safe to
> re-run against prod repeatedly.

> **✅ Security status: authenticated + fully multi-user isolated.** The app is **gated** — every page and
> `/api/*` route requires a valid session, served by the platform's hosted **Identity / Auth** capability
> (**C10**, adopted `0.6.0`: Google OAuth + email/password, multi-user signup, a hosted login surface, a
> session middleware). `/api/cron/*` is service-token'd; `/api/health` stays public. **Sessions are now
> short-lived + revocable** (adopted `0.8.0`, forge `0.17.0` P8/P9): the access `forge_session` is short
> (~15 min); the middleware silently refreshes it against `POST /auth/refresh` using an opaque, rotating
> `forge_refresh` cookie, so you stay signed in without a round-trip on the common path — but **logout /
> password-reset / revocation are immediate** (the refresh chain dies server-side; a dead session is no
> longer valid-until-exp). **Per-user data *ownership* is shipped too** — every resource is scoped to its
> owner (the session `userId`): the app's own tables carry an `owner_id` and every query filters by the
> session user (a cross-owner by-id fetch is a 404, never a 403), and the shared platform stores (C1/C3/C4)
> stamp + filter by the same opaque `owner`. Two users share the deployment yet see entirely separate apps
> (**Epic M · M2**, authorization, **C11**, adopted `0.7.0`, verified live with two users; §5/§6).
> **Operators get a generated provisioning runbook** — `forge productionize` emits `app/PROVISIONING.md`
> + an annotated `app/.env.prod.example` naming exactly this app's secrets (C13, forge `0.17.0`).

### 3a. Product feature milestones (what a user can do)

| Milestone | Feature | Spec | What shipped |
|---|---|---|---|
| **v1** | Goals & Tasks — the core | [specs/goals-and-tasks/](specs/goals-and-tasks/) | Goal lifecycle, break into Tasks, complete them, progress derived live and shown as *heat* on the "forge floor" (`/`, `/goals/[id]`) |
| **v2** | Timeline | [specs/timeline/](specs/timeline/) | Every mutation emits an Event; `/timeline` shows a heat-coded, day-grouped feed |
| **v2** | Time & Today | [specs/time-and-today/](specs/time-and-today/) | Task due dates + a `/today` board bucketed Overdue / Today / This week / Later |
| **v2** | Reminders | [specs/reminders/](specs/reminders/) | `/notifications` inbox deriving overdue tasks + cold goals, dismiss + nav badge |
| **v3** | Planner Agent | [specs/planner-agent/](specs/planner-agent/) | *Draft tasks with AI* → review cold "sketches" → accept; human always confirms. The first agent |
| **v4** | Habits | [specs/habits/](specs/habits/) | Daily/weekly habits, idempotent check-ins, streak that climbs as heat and resets on a miss |
| **v4+** | App footer | [specs/app-footer/](specs/app-footer/) | Site-wide footer (`0.11.0`): the live app version (`v<X.Y.Z>`, read dynamically from `package.json` — never hardcoded) + a static **"Powered by Mardash Forge"** attribution, isolated as link-ready markup (the platform lifts it later — tracked upstream as capability C17) |
| **v5** | Projects (Epic A · A1) | §5 Epic A · A1 (this doc) | A **Project** groups related Goals (`/projects` + a project detail view, `0.14.0`): create with title + description, add/remove Goals (a Goal belongs to ≤1 Project), a read-time **task-weighted rollup** of progress/heat across members (reuses `lib/goals` progress + `lib/heat`), and **archive** (goals survive — the `project_id` FK is nulled, never cascade-deleted). Owner-scoped like every resource; emits `project.*` timeline events. Strengthens *Organize*; app-local (forced no new platform capability) |
| **v6** | Areas (Epic A · A2) | §5 Epic A · A2 (this doc) | An **Area** is a user-defined life domain (`/areas`, `0.15.0`): create/rename/recolor/delete; tag a Goal, Habit, or Project to ≤1 Area, then **filter every list view** (Floor, Habits, Projects, Today) by `?area=<id>`. An `areas` table + a nullable `area_id` FK on goals/habits/projects (`ON DELETE SET NULL`, so deleting an Area keeps the resources — the tag is just nulled). Owner-scoped like every resource; emits `area.created` / `resource.tagged` timeline events. Strengthens *Organize*; app-local (Gate 0 ruled it pure domain reusing C10/C11/C3 — no new platform capability) |
| **v7** | Notes / Documents (Epic B · B1) | §5 Epic B · B1 (this doc) | **Notes** are markdown documents with **file attachments** (`/notes` + a `/notes/[id]` editor with a live preview, `0.18.0`): create/list/edit/delete, link to a Goal/Project, attach images/docs, and find them in Global Search. Owner-scoped (cross-owner → 404). The **first consumer of the platform blob store (C20)** — app-proxied `POST /blobs` upload, an auth-checked owner-scoped serve proxy, owner-scoped delete, 15 MB / image+doc allowlist — and indexed into **C19** search (`type: note`). Emits a `document.created` timeline event. Introduces the **Document** resource; strengthens *Organize* |

> **The only *product* surface added since v4 is app chrome (the footer above); no new domain feature
> has shipped.** Everything in `0.1.1 → 0.5.0` was **platform
> modernization** — adopting Forge capabilities and retiring the app's stopgaps. That's the wind
> tunnel working as designed, but it means the *feature* frontier (§5) is wide open.

### 3b. Platform modernization — Wave 1 (C1–C8) is **done**

The app now runs entirely on Forge capabilities; the hand-rolled machinery is gone. This is why the
backlog below targets *new* (Wave 2) capabilities rather than the ones already built.

| Cap | What it gave the app | Adopted | Retired stopgap |
|---|---|---|---|
| C1 · Agent runtime | Planner runs via `POST /capabilities/agent-run` (`lib/forge-agent.ts`); model key stays in Forge's vault | `0.2.0` | local `@anthropic-ai/sdk`, `lib/agent.ts`, `agent_runs` table |
| C2 · Scheduler / jobs | durable midnight `habits-finalize` cron → `habit_streak_breaks` | `0.1.1` | read-time-only streak reset |
| C3 · App event log | Timeline + cold-goal read the platform log (`lib/forge-events.ts`) | `0.1.1` | local `events` table |
| C4 · Notifications store | inbox upserts/dismisses against the platform store (`lib/forge-notifications.ts`) | `0.1.1` | local `dismissed_notifications` table |
| C5 · Secrets | `ANTHROPIC_API_KEY` in Forge's encrypted vault | `0.1.1` | `app/.env` + compose plumbing |
| C6 · Health/telemetry | `/api/health` real readiness (required `db` check; `lib/health.ts`) | `0.4.0` | always-`ok` liveness lie |
| C7 · Deploy | zero-downtime rollout via `forge deploy` | (deploy era) | hand-rolled `rollout.sh` |
| C8 · Productionize | `forge productionize` generates `Dockerfile` + `compose.prod.yaml` + jobs file | `0.3.0` (+`0.3.1` fixes) | hand-authored prod stack |

*Net effect on the codebase:* `lib/db.ts` fell from **656 → ~519 lines** as C1/C3/C4 lifted whole
tables and query layers into the platform — the clearest single measure that the wind tunnel is
paying down app-local debt.

> **Doc-hygiene note for whoever specs next:** the older specs are *shipped-artifact records*, not
> current mechanics. In particular [specs/planner-agent/](specs/planner-agent/) still describes a
> local `lib/agent.ts` + `agent_runs` table; those were replaced by C1 (`lib/forge-agent.ts`) in
> `0.2.0`. Read specs for *intent*; read the code + CHANGELOG for *how it works today*.

---

## 4. Competitive landscape — what to borrow (and how to keep it forge-os)

forge-os sits at the intersection of five mature product categories. The point of this survey is
**not** to clone any of them — it's to mine each for the one or two ideas that fit a *Goal-centric
life OS with a forge/heat metaphor*, and to know which table stakes we're missing. Sources are listed
at the end of this section.

**Goal-setting & OKR** — *ClickUp* ships native measurable Goals; *Quantive/Weekdone* structure
company→team→personal objectives with recurring **check-ins** (teams that check in weekly complete
~43% more OKRs); *Goalmap/Strides* track goals across **life areas** (health, money, learning) with
yes/no *and* numeric targets; *Habitica/Way of Life* prove **visual, gamified** progress drives
follow-through (esp. for ADHD).
→ *Borrow:* life **Areas**, numeric/target goals (not just task-completion %), a periodic **review/
check-in** ritual, and leaning harder into the heat metaphor as the motivation cue.

**AI daily planning** — *Motion* auto-schedules tasks into open calendar time and answers "what do I
work on next?"; *Reclaim* acts like an assistant that reshuffles meetings/tasks for you; *Sunsama* is
a mindful **daily planning ritual** (pick tasks, estimate time, place them, shut down at day's end,
morning email digest); *Akiflow* is a speed-first **unified inbox** + command bar pulling tasks from
everywhere.
→ *Borrow:* the **daily-plan ritual** and **end-of-day review**, **time estimates**, an **auto-
scheduler agent**, and a fast **command palette / unified capture**.

**Life OS / second brain** — *Notion Life OS* templates bundle goals, tasks, habits, notes, finances,
reading, relationships into one workspace organized by **PARA** (Projects/Areas/Resources/Archive),
with a **12-week planner**, vision board, and **annual reviews** — now "optimized for AI agents."
→ *Borrow:* **Projects + Areas** structure, **notes/documents** as first-class, and periodic
**reviews** as a core loop rather than an afterthought.

**Habit trackers** — *Habitica* turns habits into an **RPG** (XP, levels, gear, party accountability);
*Streaks* wins on **friction removal** (home-screen widgets, Apple Health/Watch auto-logging);
*Habitify* on cross-platform sync; *Loop* on being free/offline.
→ *Borrow:* a light **game layer** (XP/achievements atop the heat metaphor), **streak-freeze/grace**,
and **widgets/Health** for the eventual mobile app. (forge-os already has streak-as-heat — a strong,
differentiated core.)

**AI note-taking & meetings** — *Reflect* = daily notes + **backlinks** + AI that queries your entire
library; *Tana* = **supertags** that turn bullets into typed, queryable data; *Mem* = fast capture,
AI surfaces connections; *Capacities* = notes as **typed objects**. *Granola* captures meetings
locally (bot-free) → structured notes + action items; *Otter* = real-time shared transcript +
**cross-meeting Q&A**; *Fathom* = ~30s post-call summaries + action items.
→ *Borrow:* **backlinks/typed resources** (forge-os already has a typed model — lean in), **capture-
fast-organize-later**, meeting **action-items → Tasks**, and **"ask my data"** natural-language Q&A.

**Task managers & AI assistants** — *Todoist* = best-in-class **natural-language quick-add**
("call bob tomorrow 3pm #kitchen p1"), p1–p4 priorities, **Task Assist** (breaks a goal into steps),
**voice-to-task**; *TickTick* adds calendar + habits + pomodoro + **MCP** (connect Claude/ChatGPT to
your data). *Lindy/Otto* and vertical agents (finance advisor, interview/career coach, travel) point
at the **agentic** future — assistants that *do* work, not just answer.
→ *Borrow:* **NL quick-add**, explicit **priorities**, **MCP/agent access to your own data**, and the
vertical **agents** the domain model already names (Researcher, Writer, Meeting/Finance/Travel).

**Sources:** [Motion vs Reclaim vs Sunsama vs Akiflow (Temporal)](https://temporal.day/blog/motion-vs-reclaim-vs-clockwise-vs-akiflow-vs-sunsama) · [Best goal-tracking apps (Reclaim)](https://reclaim.ai/blog/goal-tracker-apps) · [Personal goal-setting apps (goalsandprogress)](https://goalsandprogress.com/best-goal-setting-apps/) · [Notion Life OS templates (notion4management)](https://www.notion4management.com/blog/best-notion-life-os-templates) · [Best habit trackers (Reclaim)](https://reclaim.ai/blog/habit-tracker-apps) · [Best second-brain apps (recall.it)](https://www.recall.it/compare/best-second-brain-apps) · [Best AI meeting notes 2026 (zackproser)](https://zackproser.com/blog/best-ai-meeting-notes-tools-2026) · [TickTick vs Todoist 2026 (2sync)](https://2sync.com/blog/ticktick-vs-todoist) · [Best AI personal assistants (Mastra)](https://mastra.ai/blog/best-personal-ai-assistants-in-2026) · [Todoist features 2026](https://thesoftwarefeatures.com/todoist-features-review-2026/).

---

## 5. The feature backlog

Each feature is a small, coherent unit that builds on the Goals/Tasks/Habits/Timeline core **and**
forces a specific Forge capability. Because Wave 1 (C1–C8) is built, the pressure now points at
**Wave 2** capabilities — the ones the domain model always implied but hasn't needed until now:

> **Wave 2 capability frontier (what these features will force into Forge):** **Identity / auth ✅** ·
> **Permissions / access control ✅** · **Search / indexing ✅** · **File & blob storage ✅** ·
> **Embeddings / vector search (RAG)** · **OAuth + external integrations / webhooks** · **Push /
> email delivery channels** · **Sync / offline** · **richer multi-step agent orchestration +
> web/tool access**. *(✅ Identity/auth shipped via **C10** — `0.6.0`; ✅ Permissions / per-user ownership shipped via **C11** — Epic M · M2, adopted `0.7.0`; ✅ Search / indexing shipped via **C19** — B5 Global Search, `0.17.0`; ✅ File & blob storage shipped via **C20** — B1 Notes attachments, `0.18.0`.)*

Per-feature format: **what** · *User can:* · *Introduces:* (resources/capabilities/agents) ·
*Pressures Forge →* (the Wave-2 capability) · *Borrow from:* · *Spec seed:* (data + key acceptance
criteria + non-goals) · *Size* (S/M/L) & *platform-pressure* (○ low / ◐ med / ● high).

### Epic A · Projects & Structure — *breadth; light platform pressure*

Turns a flat pile of Goals into an organized life. The natural first expansion, and a gentle warm-up
that starts to make **Search** necessary.

- **A1 · Projects** — ✅ **shipped (`0.14.0`).** Group related Goals; a project view rolls up progress
  across them. · *User can:* create a Project (title + description), add/remove Goals, see aggregate
  heat/progress, archive. · *Introduces:* **Project** resource; strengthens *Organize*. · *Pressured
  Forge →* nothing new — Gate 0 ruled it **fully app-local** (pure domain reusing already-adopted C10
  auth, C11 ownership, C3 app-events); it begins the case for cross-resource **Search**. · *Borrow
  from:* ClickUp Goals, Notion PARA. · *Shipped as:* `projects(id, owner_id, title, description,
  status, created_at)` mirroring `goals`, `goals.project_id` nullable FK `ON DELETE SET NULL`; a Goal
  belongs to ≤1 Project; project progress = a read-time **task-weighted rollup** across members;
  archiving/deleting a Project doesn't delete its Goals (the FK is nulled). Non-goals held: nested
  projects, sharing. · *Size S · ○*
- **A2 · Areas (life domains)** — ✅ **shipped (`0.15.0`).** Tag Goals/Habits/Projects to an Area
  (Health, Career, Finance, Relationships, Growth). · *User can:* create/rename/recolor/delete an Area,
  assign a Goal/Habit/Project to ≤1 Area, and **filter every list view** (Floor, Habits, Projects,
  Today) by it. · *Introduces:* **Area** (a lightweight per-user resource); strengthens *Organize*. ·
  *Pressured Forge →* nothing new — Gate 0 ruled it **fully app-local** (pure domain reusing
  already-adopted C10 auth, C11 ownership, C3 app-events). · *Borrow from:* Notion PARA, Goalmap. ·
  *Shipped as:* an `areas(id, owner_id, name, color, created_at)` table + a nullable `area_id uuid
  REFERENCES areas(id) ON DELETE SET NULL` on `goals`, `habits`, and `projects` (deleting an Area
  nulls the tag, never deletes the resource); owner-scoped CRUD + set/clear tag routes (cross-owner →
  404); emits `area.created` / `resource.tagged` timeline events. Non-goals held: per-Area analytics
  dashboard, an Area on Tasks. · *Size S · ○*
- **A3 · Milestones / sub-goals** — a Goal can have child Goals (or typed milestones with target
  dates). · *User can:* break a big Goal into milestones; progress rolls up. · *Borrow from:* OKR
  key-results, 12-week-year. · *Spec seed:* `goals.parent_id` self-FK **or** a `milestones` table;
  guard against cycles. · *Size M · ◐*

### Epic B · Capture & the Second Brain — *forces Search + File storage + (stretch) Embeddings*

The biggest single leap in usefulness *and* platform pressure. Makes forge-os a place you *think*,
not just a place you track.

- **B1 · Notes / Documents** — ✅ **shipped (`0.18.0`).** Markdown notes with file attachments,
  linkable to a Goal/Project. · *User can:* write a markdown note (`/notes` + a `/notes/[id]` editor
  with a live preview), attach images/docs, link it to a Goal or Project, find it in Global Search. ·
  *Introduced:* the **Document** resource; strengthens *Organize*. · *Pressured Forge →* **File & blob
  storage** — shipped as **C20** and consumed here (the first consumer): app-proxied multipart
  `POST /blobs` upload, an auth-checked owner-scoped serve proxy (`GET /api/blobs/:id` → data-plane
  `GET /blobs/:id?owner=`, cross-owner → 404), owner-scoped delete, a 15 MB cap + image/doc allowlist
  (platform sniffs magic bytes). · *Borrow from:* Notion, Capacities, Reflect. · *Shipped as:*
  `documents(id, owner_id, title, body_md, goal_id?, project_id?, created_at, updated_at)` (both links
  `ON DELETE SET NULL`) + `document_attachments(id, document_id → ON DELETE CASCADE, owner_id, blob_id,
  filename, content_type, size, created_at)`; owner-scoped CRUD (cross-owner → 404); notes indexed into
  **C19** (`type: note`) on mutation + the reindex backfill; a `lib/forge-blobs.ts` client mirroring the
  C3/C4/C19 clients; a dependency-free XSS-safe markdown renderer (`lib/markdown.ts`, renders to React
  nodes, href scheme allowlist). Non-goals held: real-time collab editing, rich-text (WYSIWYG). ·
  *Size M · ●*
- **B2 · Quick Capture / Inbox** — one fast box (⌘K or a nav "+"): type or speak, it lands in an
  **Inbox** you later triage into a Task / Note / Idea / Goal. · *User can:* capture in one keystroke
  from anywhere; triage later. · *Introduces:* an **Inbox** flow; *Organize*. · *Borrow from:*
  Akiflow unified inbox, Mem fast capture, Todoist Ramble (voice-to-task). · *Spec seed:*
  `captures(id, text, status:'inbox'|'triaged', created_at)` + a triage action that converts to the
  target resource; AC: capture never blocks; conversion preserves text. Voice → text is a later
  layer. · *Size S–M · ◐*
- **B3 · Ideas** — lightweight idea cards you can promote to a Goal/Task/Note. · *Introduces:*
  **Idea** resource. · *Spec seed:* `ideas(id, title, note, status, created_at)`, promote-to-Goal
  action (emits a Timeline event). · *Size S · ○*
- **B4 · Links & backlinks** — link any resource to any other; a "Mentions / Related" panel on each
  detail page. · *User can:* link a Note to a Goal, see everything that references a Goal. ·
  *Pressures Forge →* a **graph/index** over resources (the on-ramp to Search). · *Borrow from:*
  Reflect, Tana, Roam. · *Spec seed:* `links(from_type, from_id, to_type, to_id)`; AC: bidirectional
  display; `[[title]]` autolink in note bodies is a nice-to-have. · *Size M · ◐*
- **B5 · Global Search ✅ (`0.17.0`)** — one search box across Goals, Tasks, Projects, Areas & Habits. ·
  *User can:* find anything by keyword; jump straight to it. · *Introduced:* the **Search** capability,
  consumed from the platform's **C19** owner-scoped full-text index (no app-local SQL — the wind-tunnel move
  paid off: search is a Forge primitive). · *Shipped:* a best-effort `lib/forge-search.ts` client (mirrors the
  C3 events / C4 notifications clients); **index-on-mutation** at the same db.ts points that emit C3 events;
  a **/reindex backfill** ("reindex my data") for pre-existing rows; and a server-rendered `/search` UI with
  ranked, typed results and XSS-safe `<mark>` snippets that link back to each resource, gated behind
  `requireOwner()`. **Embeddings / semantic search** remains a possible follow-on. · AC met: `/search?q=`
  returns typed, ranked results across five resource types, owner-scoped. · *Size M · ●*

### Epic C · Journal & Reflection — *forces scheduled prompts + a Summarize agent*

Closes the loop that goal systems need to work: capture → act → **reflect**.

- **C1 · Daily Journal** — one entry per day (free text + optional mood/energy). · *Introduces:*
  **Journal** resource. · *Borrow from:* Day One. · *Spec seed:* `journal(id, date UNIQUE, body_md,
  mood?, energy?, created_at)`; AC: one entry per day, editable, `/journal` timeline. · *Size S · ○*
- **C2 · Weekly / Annual Review** — a guided ritual: what moved, what stalled (pull cold goals +
  completed tasks from the Timeline), wins, next-week focus — with an **AI-drafted summary** you edit.
  · *Introduces:* **Summarize** capability + a review flow. · *Pressures Forge →* a **C2 scheduled
  prompt** ("your weekly review is ready") **+ C1 summarize agent** over the event log — a second,
  read-oriented use of the agent runtime. · *Borrow from:* Sunsama's ritual, Notion's 12-week
  planner / annual review, the 12-Week Year. · *Spec seed:* a review is a typed Document generated
  from a date range of Timeline events; AC: "Generate my week" summarizes real activity; scheduled
  Friday reminder. · *Size M · ◐*
- **C3 · Resurfacing / "On this day"** — resurface past journal entries, achieved goals, broken
  streaks. · *Borrow from:* Day One, Mem. · *Size S · ○*

### Epic D · Time, Calendar & Auto-Scheduling — *forces OAuth/integrations + a Scheduler agent*

Where the "AI daily planner" category lives. High wow-factor; heavier because it reaches outside.

- **D1 · Calendar view** — week/month view of dated Tasks + Habit periods. · *Spec seed:* read-only
  first, over existing due dates. · *Borrow from:* TickTick, Sunsama. · *Size M · ○*
- **D2 · Calendar sync (Google / Outlook)** — two-way with an external calendar. · *Pressures Forge
  →* **OAuth / identity + external-integration framework + webhooks** — a large, clearly-generic new
  capability. · *Borrow from:* Motion, Reclaim, Sunsama. · *Spec seed:* start read-only (import busy
  blocks) to keep scope sane; the platform pressure is the OAuth/integration primitive. · *Size L ·
  ●*
- **D3 · Auto-schedule (the Scheduler agent)** — place tasks into open calendar time by due date /
  priority / estimated effort, and reschedule when things slip. · *Introduces:* **Scheduler** agent;
  real *Schedule* capability. · *Pressures Forge →* **richer multi-step agent orchestration** (plan →
  place → react) + the calendar integration. · *Borrow from:* Motion auto-schedule, Reclaim. · *Size
  L · ●*
- **D4 · Daily-plan ritual + estimates** — task time estimates; a "plan my day" flow (drag onto a
  timeline) and an end-of-day shutdown/review. · *Borrow from:* Sunsama, Akiflow. · *Size M · ◐*

### Epic E · The AI Layer — more agents — *forces multi-step orchestration + web/tool access + RAG*

Directly satisfies design constraint #6 and reuses the C1 agent backbone. Each agent is a thin
domain policy over `POST /capabilities/agent-run`.

- **E1 · Prioritizer agent** — rank today's tasks (or your active Goals) by importance × urgency ×
  effort, with a one-line rationale each. · *Introduces:* **Prioritize** capability + agent. ·
  *Borrow from:* Motion/Reclaim "what next," Todoist Task Assist. · *Spec seed:* structured-output
  agent over the Today set; AC: deterministic schema, human can override. · *Size S–M · ◐*
- **E2 · Researcher agent** — given a Goal, gather context and produce a research brief (a Document).
  · *Introduces:* **Research** capability + agent. · *Pressures Forge →* **agent web/tool access** —
  a major new capability (the current C1 runtime is single-shot, no tools). · *Borrow from:* Lindy,
  deep-research agents. · *Size M–L · ●*
- **E3 · Writer agent** — draft a Document for a Goal (plan, outreach email, proposal), reviewed
  before saving. · *Introduces:* **Write / Generate**. · *Borrow from:* Notion AI, Todoist. · *Size M
  · ◐*
- **E4 · Summarizer agent** — summarize a Goal's activity, a set of Notes, or the week (powers C2). ·
  *Introduces:* **Summarize**. · *Size S–M · ◐*
- **E5 · "Ask forge-os" (RAG over your data)** — natural-language Q&A over *your* Goals, Tasks, Notes,
  Timeline ("what did I do on the kitchen goal last month?", "which goals are stalling?"). ·
  *Pressures Forge →* **embeddings / vector store + retrieval** wired into the agent runtime — the
  highest-leverage new AI capability. · *Borrow from:* Reflect's library query, Otter cross-meeting
  Q&A, TickTick MCP. · *Size L · ●*
- **E6 · Goal / Career Coach agent** — proactive, scheduled check-ins that break down big goals,
  surface what's slipping, and nudge. · *Introduces:* **Career Coach** agent. · *Pressures Forge →*
  C2-scheduled + C1 agent working together. · *Size M · ◐*

### Epic F · Meetings — *forces audio/file ingestion + transcription integration*

A rich, on-trend vertical that the domain model already names.

- **F1 · Meetings** — a Meeting resource (title, time, attendees→Contacts, agenda, notes), linkable
  to Goals. · *Introduces:* **Meeting** resource. · *Size M · ○*
- **F2 · Meeting Assistant agent** — prep (pull related Goals/Notes/past meetings), capture notes,
  and extract **action items → Tasks**. · *Introduces:* **Meeting Assistant** agent. · *Pressures
  Forge →* **audio ingest + transcription (external API) + file storage** — a distinct new capability
  cluster. · *Borrow from:* Granola (local, bot-free), Otter (real-time shared), Fathom (fast
  summaries + action items). · *Spec seed:* start text-only (paste/upload notes → extract action
  items) before touching audio, to isolate the agent value from the ingestion capability. · *Size L ·
  ●*

### Epic G · Contacts & Relationships (personal CRM) — *forces import/integrations*

- **G1 · Contacts** — people you track; link to Goals/Meetings/Tasks. · *Introduces:* **Contact**
  resource. · *Size S–M · ○*
- **G2 · Keep-in-touch** — a follow-up cadence per contact ("reach out every 4 weeks"), surfaced as
  notifications exactly like cold goals. · *Pressures Forge →* reuses C2 + C4; contact **import**
  pushes integrations. · *Borrow from:* personal CRMs (Dex, Monica, Clay). · *Size M · ◐*

### Epic H · Decisions — *light; AI review*

- **H1 · Decision log** — a Decision (question, options, criteria, chosen option, rationale, review
  date); later, the Planner-style agent helps weigh options (*Review* capability), and a scheduled
  "was this the right call?" prompt closes the loop. · *Introduces:* **Decision** resource. · *Borrow
  from:* decision journaling. · *Size S–M · ○*

### Epic I · Finance Assistant — *forces external financial-data integration*

- **I1 · Money goals + manual budget** — link a Goal to a target amount; log contributions; heat
  tracks progress-to-target. · *Size S · ○*
- **I2 · Accounts & transactions** — connect accounts (Plaid-style), categorize spend. · *Pressures
  Forge →* **external financial-data integration + secrets/OAuth**. · *Borrow from:* Monarch, YNAB,
  Copilot. · *Size L · ●*
- **I3 · Finance Assistant agent** — budget-vs-goals insights and nudges. · *Introduces:* **Finance
  Assistant** agent. · *Size M · ◐*

### Epic J · Travel Planner — *forces a web/tool-using agent*

- **J1 · Trips** — a Trip (dates, destination, itinerary items, linked docs/bookings). · *Size M · ○*
- **J2 · Travel Planner agent** — research destinations and draft itineraries; needs web/tool access
  (shares the E2 pressure). · *Introduces:* **Travel Planner** agent. · *Borrow from:* Otto, travel
  agents. · *Size L · ●*

### Epic K · Notifications & Delivery — *forces push / email channels + mobile*

- **K1 · Real delivery** — actually *push* notifications: web push, email, and the deferred "about to
  break your streak" nudge (C2 already computes it; there's nowhere to send it). · *Pressures Forge →*
  **delivery channels (push / email / SMS)** — the missing half of C4. · *Borrow from:* everyone. ·
  *Size M · ●*
- **K2 · Daily / weekly digest** — a morning brief (today's tasks, at-risk streaks, cold goals) by
  email/push. · *Borrow from:* Sunsama's daily email, Reclaim. · *Size S–M · ◐*

### Epic L · Command & Natural Language — *forces NLP + Search*

- **L1 · Command palette (⌘K)** — add / search / navigate from one bar; **natural-language quick-add**
  ("call contractor tomorrow 3pm #kitchen p1" → a dated, tagged Task). · *Pressures Forge →* NLP
  parsing + hooks into Search. · *Borrow from:* Todoist NL quick-add, Akiflow command bar, Superhuman.
  · *Size M · ◐*

### Epic M · Identity, Authentication & Authorization — *✅ M1 + M2 shipped; M3 (sharing) deferred*

**Status.** **M1 (Authentication) is shipped/adopted** (`0.6.0`) — the app is gated on the platform's
hosted **Identity / Auth** capability (**C10**). **M2 (per-user ownership / authorization) is shipped/adopted**
(`0.7.0`) — every resource is owner-scoped and users are fully isolated, via the platform's **Permissions /
per-user ownership** capability (**C11**); verified live with two users. **M3 (sharing)** stays deferred.

**Why it happened (genuinely pressured, not roadmap-driven).** forge-os went *live* (behind Traefik at
`forge-os.mardash.ai`) with **no authentication** — anyone who reached the URL had full access to
every feature and every user's data. Prior features listed "no auth" as a non-goal because the app
was local/single-user; once it was live, **open access became a real problem.** That is the litmus
test firing: the app hit a wall, and Forge grew an **Identity / Auth** capability (C10) to meet it.

> **Wind-tunnel guidance (this is how it played out).** Authentication is textbook *generic
> machinery* — so it was **not** hand-rolled in `./app`. At **Gate 0** it filed an **Identity / Auth**
> platform capability (user store, login, session/cookie management, OAuth/passkeys) that the app
> consumes, exactly as C1–C8 were adopted — delivered as **C10** and adopted in `0.6.0`. No interim
> coarse edge gate (Traefik basic-auth / shared passphrase) was needed; the real capability landed
> first.

- **M1 · Authentication — gate the app** — ✅ **shipped / adopted (`0.6.0`, via C10; refresh-revocation
  session model adopted `0.8.0`, forge `0.17.0` P8/P9).** The app is fully gated on the platform's hosted
  Identity/Auth: Google OAuth + email/password, multi-user signup, a hosted login surface, and a session
  middleware over **all** routes; `/api/cron/*` is service-token'd and `/api/health` stays public. The
  access `forge_session` is now short-lived (~15 min) and the middleware transparently refreshes it via a
  same-origin `POST /auth/refresh` (opaque, rotating `forge_refresh` cookie), so **logout / reset / server-side
  revocation take effect immediately** rather than lingering until token expiry. *(Spec of record below.)* · *User can:* sign
  in (email + password / magic link / OAuth Google or GitHub / passkey), stay signed in, sign out;
  unauthenticated requests to any page or `/api/*` route are rejected or redirected to login. ·
  *Introduces:* a **User / account** identity + sessions. · *Pressures Forge →* **Identity / Auth**
  (the capability to file at Gate 0). · *Borrow from:* Auth.js / Clerk / WorkOS patterns; passkeys are
  the 2026 default. · *Spec seed:* session-checking middleware over **all** routes; a `users` record
  (`id, email, created_at`); `GET /api/me`. **Migration:** on cutover, existing
  goals/tasks/habits/events/etc. are assigned to the first (owner) user. AC: no route serves data
  without a valid session; a fresh visitor sees a login screen; sign-out clears the session.
  Non-goals (this feature): sharing, roles beyond a single owner. · *Size L · ●*
- **M2 · Authorization — ownership & access control** — ✅ **shipped / adopted (`0.7.0`, via C11).** Every
  resource belongs to a user; you can only read or mutate your own. The app's own tables
  (`goals/tasks/habits/habit_checkins/habit_streak_breaks`) carry an `owner_id` and **every** query filters
  by the session `userId`, returning **404 (not 403)** for another user's id so existence never leaks;
  children inherit their parent's owner. The shared platform stores (C1 agent-runs, C3 events, C4
  notifications) take the same opaque `owner` — write stamps it, read filters to it — so timelines and
  inboxes are per-user too. Migration on cutover: existing rows backfilled to the seeded owner and
  owner-less shared-store records claimed via `forge owner claim-legacy`. **Verified live with two users:**
  the owner sees their own data; a second user sees an entirely empty app; each user's by-id fetch of the
  other's goal is a 404. · *User can:* trust that their Goals/Tasks/Notes/Habits are private. ·
  *Introduces:* an **owner** on every resource + enforcement at the data layer; the **Permissions /
  per-user ownership** capability. · *Pressured Forge →* **Permissions / access control** (**C11**). AC met:
  user A can never see or mutate user B's resources through any page or route; the health check and cron
  endpoints stay appropriately unauthenticated/service-scoped. Non-goals: shared/role-based access
  (that's M3). · *Size M–L · ●*
- **M3 · Sharing & collaboration** — invite others to a Goal/Project, assign Tasks, comment; roles
  (owner / editor / viewer). *The multi-user frontier — build only after M1 + M2, when collaboration
  is actually needed.* · *Pressures Forge →* **permissions + real-time**. · *Borrow from:* Asana,
  ClickUp, Notion sharing. · *Size L · ●*

### Epic N · Mobile & Offline — *design constraint #8; forces sync + shared resources*

- **N1 · iOS app / PWA** — the "makes sense as an iOS app" constraint, with home-screen check-ins and
  Apple Health for habits. · *Pressures Forge →* **mobile shared resources + push**. · *Borrow from:*
  Streaks, Things. · *Size L · ●*
- **N2 · Offline-first sync** — work offline, reconcile on reconnect. · *Pressures Forge →*
  **synchronization**. · *Size L · ●*

### Epic O · Motivation & Game Layer — *light; domain (extends the heat/forge metaphor)*

- **O1 · XP / levels / achievements** — reward consistency; you're *forging* your life. · *Borrow
  from:* Habitica. · *Size M · ○*
- **O2 · Streak-freeze / grace** — bank a day to protect a streak. · *Borrow from:* Duolingo, Streaks.
  · *Size S · ○*

### Epic P · Integrations & Import — *forces an integration framework + webhooks*

- **P1 · Import** — from Todoist / Things / Notion. · *Size M · ◐*
- **P2 · Connect** — Google Calendar / Slack / GitHub / email as event sources. · *Pressures Forge →*
  **OAuth + webhooks + integration framework** (shares D2). · *Borrow from:* Sunsama's broad
  integration ecosystem. · *Size L · ●*

---

## 6. Recommended sequencing

The wind-tunnel goal is to keep each wave forcing a *clear, generic* new Forge capability while
staying genuinely useful. Ordered by leverage:

**✅ Shipped — Authentication & Authorization (Epic M).** **M1 (login gate) is shipped / adopted**
(`0.6.0`, via the **Identity / Auth** capability **C10**) — the app is no longer open. **M2 (per-user
ownership) is now shipped / adopted** (`0.7.0`, via the **Permissions / per-user ownership** capability
**C11**), forcing the **Permissions / access control** capability — the app is now fully multi-user and
isolated (verified live with two users). Together they were a high-value wind-tunnel wave.
(Sharing/collaboration — **M3** — stays deferred until multi-user collaboration is genuinely needed.)

**▶ Recommended next feature set — "Knowledge & Search" (Epics A + B).** Ship **A1 Projects ✅ (`0.14.0`) →
A2 Areas ✅ (`0.15.0`) → B5 Global Search ✅ (`0.17.0`) → B1 Notes ✅ (`0.18.0`) → B2 Quick Capture.** (A1 + A2
shipped app-local — Gate 0 ruled each pure domain, no new platform capability. B5 shipped as the first **C19**
consumer — search is now a platform primitive, not app-local SQL. B1 Notes shipped as the first **C20** (blob
storage) consumer — file attachments are a platform primitive too; **B2 Quick Capture is next**.)
Why this set:
- *Genuinely useful:* turns forge-os from a goal tracker into a real life OS / second brain — the
  category every competitor occupies and the one the domain model most obviously implies.
- *Clean platform pressure:* it forces the **two most conspicuous missing Forge capabilities at once
  — Search/indexing and File/blob storage** — plus a stretch toward **embeddings**. That's a textbook
  litmus-test wave: the app hits a real wall (nothing is searchable) and Forge grows to meet it.
- *Right size:* mostly S/M features that build directly on Goals/Tasks with no external dependencies,
  so it moves fast and de-risks the bigger epics.

**Strong alternatives (pick by appetite):**
- **"AI layer" (Epic E):** E1 Prioritizer → E4 Summarizer → C2 Weekly Review → E5 Ask-forge-os.
  Highest wow, reuses C1; E5 forces **embeddings/RAG**. Choose this to double down on the AI
  constraint (#6).
- **"Planner" (Epic D):** D1 Calendar → D2 Calendar sync → D3 Auto-schedule. Biggest "aha," but the
  heaviest — it forces **OAuth/integrations**, the largest single Wave-2 capability. Choose this to
  compete head-on with Motion/Sunsama.
- **"Reflection loop" (Epic C):** cheapest coherent win (Journal + Weekly Review) that closes the
  goal-system loop and warms up the Summarize agent.

**Deferred until pressured** (per the litmus test — build when a shipped feature *needs* them, not
because the roadmap lists them): **Sharing/collaboration (M3)**, **Mobile/Offline (N)**, **Finance
(I)**, **Travel (J)**, **Meetings audio (F2)**. Each is a large capability jump; let a smaller
feature create the demand first. *(Note: **authentication — M1 — has shipped** (C10, `0.6.0`) and
**authorization — M2 — has shipped** (C11, `0.7.0`); the live app already created the demand and the app
is now fully multi-user isolated. See "Shipped" above.)*

---

## 7. How to use this doc (for the next agent)

1. **Pick a feature or the recommended set** (§5/§6). A "set" is 3–5 small features shipped in
   sequence, each green before the next.
2. **Run the `add-a-feature` skill.** As of `0.5.0` it opens with **Gate 0** — a Feature Brief that
   decides, *before* any app code, which parts are app-local vs. a platform capability. If a part is
   generic (e.g. Search, file storage), Gate 0 files a `Cn` and you may **WAIT** to adopt it via the
   relay rather than build a stopgap. Use the *Pressures Forge →* line on each feature as the
   Gate-0 hint.
3. **Write the specs.** `specs/<feature-slug>/FEATURE.md` (Goal + acceptance criteria — the *Spec
   seed* here is your starting point) and, for anything with UI, `DESIGN.md` via the
   **`frontend-design`** skill (keep the forge/heat visual language).
4. **Implement under `./app`**, validate through `./forge` (lint/build/test), and verify end-to-end.
5. **Keep this doc honest.** When a feature ships, move it into §3 with its version, flip the §2
   status, and note the platform capability it forced. When you adopt a new capability, it's recorded
   in [PLATFORM_CAPABILITIES.md](PLATFORM_CAPABILITIES.md) + [CHANGELOG.md](CHANGELOG.md), not here.

> The measure of success is unchanged: **every feature should either delight a user or force Forge to
> grow — ideally both.** A feature that does neither isn't a wind-tunnel feature.
