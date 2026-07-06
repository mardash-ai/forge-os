# Planner Agent — Design Spec

Extends the forge-os system (`specs/goals-and-tasks/DESIGN.md`). This adds a small surface to
the **goal detail** page — no new page. Read the base spec first.

## 1. Thesis

The Planner is the first agent, and its work should read as **provisional** until a human
forges it. The app's language already has a word for "not yet worked": **cold**. So AI-proposed
tasks appear as **cold sketches** — dashed, temper-blue (`--t0`), unforged. You accept the ones
worth keeping; each accepted sketch becomes a real Task (a stroke you can then heat by
completing it). The agent proposes in cold; the human commits to the fire.

This reuses the heat ramp's cold end rather than inventing an "AI color," so the agent stays
inside the app's visual world.

## 2. Signature — cold sketches → real strokes

The review panel shows each proposed task as a **dashed, cool row** with an **accept toggle**
(pre-checked), clearly distinct from the solid, warm real-task rows above it:

```
HAMMER STROKES
┌───────────────────────────────────────────────────────┐
│ ✓  Define the domain model            Struck          │  ← real tasks (solid)
│ ○  Provision Postgres        07/09/2026   Mark complete│
└───────────────────────────────────────────────────────┘

[ ✦ Draft tasks with AI ]                                  ← accent button

PLANNER · DRAFTED 5                                         ← mono eyebrow (appears after drafting)
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐  ← dashed temper-blue container
│ ☑  Sketch the API routes                                │  ← cool, dashed rows; checkbox pre-checked
│ ☑  Write the data-access layer                          │
│ ☐  Add integration tests                                │  ← unchecked = won't be added
│ ☑  Wire up the UI                                       │
│ ☑  Document the endpoints                               │
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
[ Add 4 tasks ]   [ Dismiss ]
```

- **Draft button**: accent (`--accent`), with a small spark glyph (`✦`) marking it as the agent.
  Label plainly says what it does: **"Draft tasks with AI"** → while running, **"Drafting…"**.
- **Proposed rows**: 1px **dashed** border in `--t0` (temper-blue), text in `--ash`, a checkbox
  (pre-checked). They read as cold and tentative next to the solid real tasks.
- **Actions**: `Add N tasks` (accent, N = checked count, disabled at 0) · `Dismiss` (ghost).
- **Eyebrow**: `PLANNER · DRAFTED <n>` (mono) — names the agent and what it produced.

## 3. Tokens & type

No new palette. Cold sketches use `--t0 #38506B`; button/accent `--accent #CB5320`; text
`--chalk` / `--ash`; errors `--warn`. Type: Bricolage / Instrument / IBM Plex Mono. The one new
glyph is the spark `✦` on the draft button — the agent's mark.

## 4. Motion

- **Drafting:** the button shows "Drafting…" and a faint pulsing spark; the panel fades in when
  results arrive. One calm wait-state, no spinner theatrics.
- **Accept:** the panel fades out; the new real tasks appear in the list above (page refresh) —
  the sketches "heat into" strokes. Reduced-motion: instant.

## 5. Voice

- Button: `Draft tasks with AI` → `Drafting…`. Eyebrow: `PLANNER · DRAFTED n`.
- **No key** (503): interface voice, actionable — *"AI planning is unavailable. Set an
  `ANTHROPIC_API_KEY` to let the Planner draft tasks."* Shown inline where the panel would be.
- **Failure:** *"The Planner couldn't draft tasks just now. Try again."*
- **Empty result:** *"The Planner didn't find anything to add. Add a task yourself, or try a
  fuller goal description."*
- Accept keeps meaning end-to-end: `Add 4 tasks` → four real tasks appear and the Log records
  four `Added …` events.

## 6. Quality floor

- **Human-in-the-loop is explicit:** nothing is added until the human presses `Add`; unchecked
  sketches are discarded.
- **Never color-alone:** proposed rows are marked by the dashed border *and* the `PLANNER`
  eyebrow *and* the checkbox — not color alone.
- **Focus:** the draft button, each checkbox, and both actions have visible `--focus` rings and
  are keyboard operable.
- **Contrast:** cool `--t0` on `--iron` for borders is decorative; the row text stays `--ash`/
  `--chalk` ≥ 4.5:1. Reduced motion honored.

## 7. What this rejects

- **A new "AI" accent color** → rejected; the agent speaks in the ramp's existing cold end, so
  it belongs to the same world.
- **Auto-adding generated tasks** → rejected; the human always confirms. The agent drafts; it
  doesn't decide.
- **A separate "agent" page or modal** → rejected; drafting happens inline where the tasks live.
