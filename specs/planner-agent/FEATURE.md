# Feature: Planner Agent

## Goal
The first **AI agent** in forge-os: from a Goal's title and description, it drafts a proposed
list of Tasks you review, edit down, and accept — so an empty goal can be broken into concrete
next steps in one click, with a human always confirming before anything is added.

## Acceptance criteria

### Generating a plan
- [ ] `POST /api/goals/{id}/plan` returns JSON `{ runId, model, tasks: [{ title }] }` with a
      handful of proposed task titles derived from the goal, when the model is configured.
- [ ] Proposed titles are **cleaned by the app, not trusted raw**: trimmed, empties dropped,
      duplicates removed (case-insensitive), and capped at a sensible maximum (≤ 8).
- [ ] `POST` on an unknown or malformed goal id returns 404.
- [ ] When no API key is configured, `POST` returns **503** with a clear message ("AI planning
      is unavailable — set `ANTHROPIC_API_KEY`") — the app never crashes on a missing key.
- [ ] A model or network failure returns a clear error status (not a 500 stack), and the app
      stays usable.

### Recording the run (the Agent Task / Artifact)
- [ ] Every generation persists an **agent run**: `{ id, goalId, kind: "planner", status:
      "succeeded" | "failed", model, result (the proposed tasks), error, createdAt }`, and it
      survives a restart. This is the app's first **Agent Task** resource; its `result` is the
      **Artifact** the agent produced.

### Reviewing and accepting (human in the loop)
- [ ] The goal detail page has a **"Draft tasks with AI"** control.
- [ ] Invoking it shows the proposed tasks in a review panel, each with an **accept toggle**
      (pre-selected), visually **distinct from real tasks** (proposed, not yet forged).
- [ ] **Accepting adds only the selected tasks** to the goal (reusing normal task creation), so
      they become real Tasks — and therefore show up on the Timeline (`task.added`) and count
      toward the goal's progress. Nothing is added without the human accepting.
- [ ] The review panel can be dismissed without adding anything.
- [ ] An empty result or a failure shows an inviting message in the panel, not a blank state or
      a crash.

## Details

- **Data (persists — Postgres):** an `agent_runs` table (`id uuid`, `goal_id uuid`, `kind text`,
  `status text`, `model text`, `result jsonb`, `error text`, `created_at timestamptz`).
  Proposed tasks are **not** stored as Tasks until accepted.
- **Routes/pages:** `POST /api/goals/[id]/plan`; the review UI lives on the existing
  `/goals/[id]` page (no new page).
- **Where logic lives:**
  - `app/lib/planner.ts` — **pure**: the prompt/system text, the response JSON schema, and
    `cleanProposedTasks(raw, opts)` (trim / drop empty / dedupe / cap). Unit-tested.
  - `app/lib/agent.ts` — **impure**: the Anthropic call (official `@anthropic-ai/sdk`,
    `claude-opus-4-8`, structured outputs, adaptive thinking at low effort). Exposes
    `isPlannerConfigured()` and `generatePlan(goal)`.
  - `app/lib/db.ts` — `recordAgentRun(...)` and the schema.
- **Non-goals:**
  - Any other agent (Researcher, Writer, Scheduler, …) — Planner only.
  - Editing the prompt from the UI, regenerate/iterate history, or streaming the generation
    into the UI token-by-token.
  - The agent acting **autonomously** — it only *proposes*; a human accepts. No auto-adding, no
    tool use / agentic loop (this is a single structured call).
  - Auth / multi-user.
- **Notes:**
  - The key is read from `ANTHROPIC_API_KEY` (wired into `app/compose.yaml` so setting it on the
    host activates the feature). Absent key ⇒ 503, never a crash — so the app is fully usable
    without a key; only live drafting is gated.
  - Treat model output as untrusted: validate/clean every title in `lib/planner.ts` before it
    reaches the UI or the database.
  - This is the wind-tunnel feature for the **Agent framework**: it introduces the Agent Task +
    Artifact resources and the first "capability" (Plan). Later agents reuse the `agent_runs`
    backbone.
