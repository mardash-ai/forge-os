# Adding a Feature

Building on this app is **spec-driven and design-first**: you describe the outcome, and
Claude turns it into working, validated code. You don't hand-write files or run build tools.

## You write a little; Claude does the rest

Drop a short spec in `specs/<feature-slug>/FEATURE.md` (template below) and tell Claude:

> **"Add a feature — implement `specs/<feature-slug>/FEATURE.md`."**

Claude runs the **`add-a-feature` skill**, which is the source of truth for the whole
workflow. It will:

1. Firm up the spec (only asking about hard-to-reverse choices, like *must this data survive
   a restart?*).
2. **Design first** for any UI — produce a `DESIGN.md` via the `frontend-design` skill, and
   often an interactive mockup for you to approve — before writing components.
3. Implement under `./app` (logic in `app/lib/`, pages in `app/app/`, tests in `app/tests/`).
4. Validate in Docker with `./forge lint / build / test`, self-healing via `./forge explain`.
5. **Verify the behavior end-to-end** (drives the running app, checks persistence, screenshots UI).

You don't need to specify file names, libraries, or steps — the skill and Forge's
conventions fill those in.

## The spec template

Only **Goal** and **Acceptance criteria** are required. Everything else sharpens accuracy.

```markdown
# Feature: <short name>

## Goal
<1–2 sentences: what a user can do, and why.>

## Acceptance criteria
- [ ] <observable behavior you could check by hand>
- [ ] <...>

## Details (optional — include only what matters)
- Routes/pages: <e.g. /tasks page; GET & POST /api/tasks>
- Data: <entities + fields; say if it must persist across restarts>
- Non-goals: <what NOT to build>
- Notes: <constraints, edge cases, UI wishes>
```

**Tips for specs that build first-try:** write criteria you could verify by hand ("rejects
empty titles with 400" beats "handles bad input"); name the routes; list non-goals to stop
gold-plating; keep each feature small and chain them for a big goal.

## Example: a real feature

See [`goals-and-tasks/`](goals-and-tasks/) — the spec (`FEATURE.md`) and the visual design
spec (`DESIGN.md`) for this app's core, both produced through this workflow.

---

*The full procedure, conventions, and persistence patterns live in the `add-a-feature`
skill (`.claude/skills/add-a-feature/SKILL.md`) — that's the authoritative reference; this
page is just the human-facing entry point.*
