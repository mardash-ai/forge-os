# Sample Project Ideas for Forge

## The Role of the Sample Project

The sample project is not just a demo.

It is the wind tunnel for Forge.

Every new Forge capability should exist because the sample application
genuinely needs it---not because the architecture says it should.

This mirrors how successful platforms evolved:

-   Git was built to support Linux kernel development.
-   Kubernetes evolved to run Google's workloads.
-   Stripe built many internal platform capabilities to support real
    products.

The sample application should continuously pressure Forge to become a
better platform.

------------------------------------------------------------------------

# Design Constraints

A good sample project should:

1.  Be genuinely useful.
2.  Be open source.
3.  Be understandable by anyone.
4.  Have a rich domain model.
5.  Require both frontend and backend.
6.  Naturally exercise AI agents.
7.  Continue growing for years.
8.  Make sense as both a web and iOS application.

These constraints eliminate many common demo applications such as todo
lists, kanban boards, and chat apps because they become "finished" too
quickly.

------------------------------------------------------------------------

# The Litmus Test

Every week, Forge should need another capability because the application
encountered a real problem.

Not because the platform roadmap says another capability should exist.

------------------------------------------------------------------------

# Project Idea --- Forge OS

## A Personal Operating System

Think of Forge OS as:

> The system that helps you run your life.

Everything revolves around Goals.

The application's own domain model naturally mirrors Forge's:

Builder

↓

Goal

↓

Capabilities

↓

Resources

↓

Events

### Resources

-   Goal ✅ *(shipped in v1)*
-   Project
-   Task ✅ *(shipped in v1)*
-   Document
-   Meeting
-   Contact
-   Idea
-   Decision
-   Habit
-   Journal
-   Agent Task
-   Artifact
-   Notification
-   Timeline Event

### Capabilities

-   Plan
-   Prioritize
-   Schedule
-   Research
-   Write
-   Summarize
-   Review
-   Generate
-   Notify
-   Search
-   Organize

### Agents

-   Planner
-   Researcher
-   Writer
-   Scheduler
-   Meeting Assistant
-   Career Coach
-   Finance Assistant
-   Travel Planner

### Why it pressures Forge

Every feature naturally requires Forge capabilities:

-   Notifications → Events
-   Search → Indexing
-   Collaboration → Permissions
-   Background jobs → Workflow composition
-   AI → Agent framework
-   Offline support → Synchronization
-   Mobile → Shared resources
-   OAuth → Identity
-   Observability → Platform telemetry

Nothing feels artificial.

------------------------------------------------------------------------

# Status & Roadmap

## ✅ Done — shipped

**v1 · Goals & Tasks — the core.** The Goal-centric spine of forge-os is live and
persisted in Postgres, with the design-first "forge floor" UI where each Goal's progress
reads as *heat* (cold when untouched, glowing as it nears done).

-   **Resources shipped:** **Goal** (title, description, status, derived progress) and
    **Task** (title, done, belongs to a Goal).
-   **What a user can do:** create / list / view Goals; move a Goal through its lifecycle
    (Active → Achieved → Archived); break a Goal into Tasks; complete Tasks; watch progress
    derived live from a Goal's tasks. Data survives restarts.
-   **Not yet built:** any Capability (Plan, Schedule, Notify, Search, …), any Agent,
    notifications, search, auth, or multi-user — those are the backlog below.

*Spec + design live in `specs/goals-and-tasks/{FEATURE,DESIGN}.md`.*

**v2 · The Events → time → background-jobs spine.** Three features that build on the core,
each shipped green (lint/build/test) and verified end-to-end:

-   **Timeline** *(`specs/timeline/`)* — the app emits its own **Events** at every mutation;
    `/timeline` shows them as heat-coded sparks. *Realized the Event backbone.*
-   **Time & Today** *(`specs/time-and-today/`)* — task **due dates** + a `/today` board
    bucketed Overdue / Today / This week / Later. *Made time first-class (the Schedule need).*
-   **Reminders** *(`specs/reminders/`)* — a `/notifications` inbox deriving **overdue** tasks
    and **cold goals** (via the Event log), with dismiss + a nav badge. *Exposed the real
    platform gap: everything is read-time — Forge still needs a **scheduler / background jobs**
    to push these while you're away.*

**v3 · Planner Agent — the first AI agent.** *(`specs/planner-agent/`)* From a Goal's title
and description, the **Planner** drafts a list of proposed Tasks you review as cold "sketches"
and accept — a human always confirms before anything is added.

-   **What a user can do:** on a goal, *Draft tasks with AI* → review the proposed tasks (each
    a dashed, temper-blue *sketch* with an accept toggle) → accept the ones worth keeping, which
    become real Tasks (Timeline `task.added`, count toward progress). Missing key ⇒ a graceful
    503 notice, never a crash; failures record and surface cleanly.
-   **Realized the Agent framework:** introduces the **Agent Task** + **Artifact** resources
    (the persisted `agent_runs` table) and the first **Plan** capability — the backbone later
    agents reuse. *Pressures Forge → AI / the Agent framework.*
-   **Activation:** set `ANTHROPIC_API_KEY` (wired through `app/compose.yaml`); the app is fully
    usable without it — only live drafting is gated.

## 🔜 Proposed next — pick a set to spec

Each candidate is a small, coherent feature that builds on Goals & Tasks **and** forces a
specific Forge capability into existence — that's the wind-tunnel point (see *The Litmus
Test*). Ordered roughly by how hard they press on the platform.

**1 · Planner Agent — AI drafts the tasks** — ✅ **SHIPPED (v3)** *(the first agent)*
From a Goal's title + description, generate a proposed list of Tasks you review, edit, and
accept before they're added.
-   *Pressures Forge →* the **Agent framework** + a **Plan / Generate** capability + AI
    (Claude API). Introduces the **Agent Task** and **Artifact** resources.
-   *Delivered the clearest single jump in platform capability, and directly satisfied the
    "naturally exercise AI agents" design constraint.*

**2 · Timeline — your life as Events** — ✅ **SHIPPED (v2)** *(mirrors Forge's own model)*
A chronological feed of what happened: Goal created, Task completed, status changed. The app
emits its **own Events**, exactly as Forge does internally.
-   *Pressures Forge →* **Observability / platform telemetry**; introduces the **Timeline
    Event** resource. Elegant fit — the domain mirrors the platform — and it's the backbone
    reminders later read from.
-   *Why now:* mostly self-contained and buildable today; lays the Event foundation.

**3 · Time & Today — due dates + a focus view** — ✅ **SHIPPED (v2)**
Give Tasks (and Goals) dates, plus a "Today / This Week / Overdue" view that answers *what
now?*
-   *Pressures Forge →* the **Schedule** capability; makes time first-class — the precursor
    to reminders.

**4 · Reminders & Notifications** — ✅ **SHIPPED (v2)** *(deepest platform pressure)*
Surface due / overdue tasks and goals gone "cold" as notifications.
-   *Pressures Forge →* **Notifications → Events** and, critically, **background jobs →
    workflow composition** — Forge needs a way to run recurring work. Introduces the
    **Notification** resource. *(Builds on #3 dates and #2 events.)*

**5 · Habits — recurring goals with streaks**
Habits that recur daily / weekly, reset on cadence, and track a streak.
-   *Pressures Forge →* **Schedule + background jobs** (the reset) and **Events**
    (check-ins). Introduces the **Habit** resource and recurrence.

**6 · Projects — group related Goals**
A Project groups Goals; its view rolls up progress across them.
-   *Pressures Forge →* hierarchy / organization (lighter platform pressure). Introduces the
    **Project** resource. Good if you want breadth before depth.

**Still open:** **#5 Habits**, **#6 Projects**.

**Recommended next:** **#5 Habits** — it cashes in the **background-jobs / scheduler** pressure
that Reminders (#4) exposed but couldn't yet satisfy (recurrence + streak resets need real
recurring work), and it reuses the Events backbone for check-ins. (Or #6 Projects for breadth —
grouping Goals — if you want a lighter, hierarchy-focused feature before more platform depth.)

With the Planner (#1) shipped, a natural **v4** theme is *more of the Agent framework*: a second
capability on the same `agent_runs` backbone (e.g. **Prioritize** or **Summarize** a goal), or
letting the Planner **persist its runs into a visible history**. Those press on agent
composition rather than introducing a new resource.