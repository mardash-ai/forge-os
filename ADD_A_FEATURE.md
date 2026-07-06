# Adding a Feature (Spec-Driven)

The way to build on Forge is: **describe the outcome, not the implementation.** You write a short *feature spec*; an agent (Claude) turns it into code that follows Forge's conventions, then validates it with `./forge` until it's green. You don't hand-write files or run build tools.

The goal of a spec is to let the agent build it **correctly on the first try** — so a good spec is small but *unambiguous about "done."* You do **not** need to specify file names, libraries, or steps; the agent infers those from the conventions below.

---

## The loop

```
1. Write a spec   →   a FEATURE.md (template below). Small is fine.
2. Hand it over   →   tell Claude: "Implement FEATURE.md for app <name>."
3. Agent builds   →   plans, writes files under apps/<name>/, following Forge conventions.
4. Agent validates →  ./forge lint / build / test  (in Docker), self-healing via ./forge explain.
5. Done           →   lint, build, and test are green and the acceptance criteria hold.
```

For a bigger feature, you can seed the plan first:

```bash
./forge plan --app <name> --goal "Let users track simple tasks"
```

That returns proposed files, a capability sequence, and validation steps — a useful skeleton to turn into the spec below.

---

## What's crucial vs. what you can omit

Keep the burden low. Only two things are **required**; the rest sharpen accuracy and are optional.

| Field | Required? | Why it matters |
|---|---|---|
| **Goal** | ✅ Required | One or two sentences. What a user can do and why. Frames the whole feature. |
| **Acceptance criteria** | ✅ Required | Observable, checkable statements. This *is* the definition of done — it's what makes "first-try correct" possible. |
| Routes / pages | Recommended | Naming the exact URLs removes guesswork about surface area. |
| Data | Recommended | Entities + fields, and **whether it must survive a restart** (that's the only thing that forces a database). |
| Non-goals | Recommended | The cheapest way to prevent scope creep and over-engineering. |
| UI/notes/constraints | Optional | Only when a specific look or rule matters. |

**Everything you leave out, the agent fills with sensible defaults and Forge conventions.** It should only stop to ask you when a choice is hard to reverse (e.g. "should this data persist across restarts?") — not for cosmetic decisions.

---

## Spec template (copy this)

```markdown
# Feature: <short name>

## Goal
<1–2 sentences: what a user can do, and why.>

## Acceptance criteria
- [ ] <observable behavior an agent can verify>
- [ ] <...>

## Details (optional — include only what matters)
- Routes/pages: <e.g. /tasks page; GET & POST /api/tasks>
- Data: <entities + fields; say if it must persist across restarts>
- Non-goals: <what NOT to build>
- Notes: <constraints, edge cases, UI wishes>
```

---

## Conventions the agent will follow (so you don't have to specify them)

The scaffold is **Next.js (App Router) + TypeScript + Vitest**, all run in Docker. The agent should:

- **Pages** → `app/<route>/page.tsx`.  **API** → `app/api/<name>/route.ts`.  Dynamic → `app/api/<name>/[id]/route.ts`.
- **Put real logic in `lib/<name>.ts` as pure functions** (validation, formatting, state transitions), and keep pages/routes thin wrappers that call it. This is important: tests run in a **Node** environment against `tests/**/*.test.ts`, so pure `lib/` functions are directly testable — React components are not tested by default.
- **Tests** → `tests/<name>.test.ts`, covering the acceptance criteria and edge cases (Vitest).
- **Persistence is opt-in.** Default to an in-memory store (simple, resets on restart — fine for local features). Only reach for a database when the spec says data must survive restarts — then reprovision: `./forge provision --app <name> --with-postgres`.
- **Validate only through Forge, in Docker** — never `npm`/`next` directly:
  ```bash
  ./forge lint  --app <name>
  ./forge build --app <name>
  ./forge test  --app <name>
  ```
  On any failure, run `./forge explain --resource <id>`, fix the named files, re-run. Confirm surface area with `./forge inspect routes --app <name>` (don't read the whole repo).
- **Definition of done:** `lint` = 0 problems, `build` = succeeded, `test` = succeeded (0 failed), and every acceptance criterion holds.

---

## Example 1 — bare-bones

The minimum that still builds correctly: a Goal and one checkable criterion. No data, no API.

```markdown
# Feature: About page

## Goal
Visitors can read a short "About" page describing what this app does.

## Acceptance criteria
- [ ] Visiting /about shows a heading and a paragraph of descriptive text.
```

**What the agent does with it:** creates `apps/<name>/app/about/page.tsx` (a server component with the heading + paragraph), then:

```bash
./forge lint --app <name> && ./forge build --app <name>
./forge inspect routes --app <name>     # confirms /about now exists
```

No test is required for static content. That's a complete, valid feature — start here to get a feel for the loop.

---

## Example 2 — more robust

Enough detail for a real feature, still no over-specification. Notice it names routes, defines the data, pins edge cases in the acceptance criteria, and bounds scope with non-goals.

```markdown
# Feature: Task list

## Goal
A user can view a list of tasks, add a task, and mark a task complete, so they
can track simple to-dos.

## Acceptance criteria
- [ ] GET /api/tasks returns the current tasks as JSON.
- [ ] POST /api/tasks with { "title": "..." } adds a task and returns it with an
      id and completed=false.
- [ ] POST /api/tasks/{id}/complete marks that task complete.
- [ ] Titles are trimmed; an empty or whitespace-only title is rejected with 400.
- [ ] The /tasks page lists tasks and visually shows which are complete.

## Details
- Data: Task { id: string; title: string; completed: boolean; createdAt: string }.
  In-memory store is fine for v1 — it may reset on restart (that's acceptable here).
- Routes/pages: /tasks (page); /api/tasks (GET, POST); /api/tasks/[id]/complete (POST).
- Non-goals: editing or deleting tasks, authentication, cross-restart persistence,
  pagination, or search.
```

**What the agent does with it:**

- `lib/tasks.ts` — the store plus pure functions: `listTasks`, `addTask` (trims, rejects empty), `completeTask`. These carry all the logic and are unit-tested.
- `app/api/tasks/route.ts` (GET, POST) and `app/api/tasks/[id]/complete/route.ts` (POST) — thin handlers over `lib/tasks.ts`, returning proper status codes (400 on empty title).
- `app/tasks/page.tsx` — lists tasks and shows completed state.
- `tests/tasks.test.ts` — covers add (trim + empty rejection), complete, and list ordering.

Then validate:

```bash
./forge lint --app <name> && ./forge build --app <name> && ./forge test --app <name>
```

If you later decide tasks must survive restarts, that's the trigger to add a database: `./forge provision --app <name> --with-postgres`, and ask the agent to move the store behind it — a deliberate upgrade, not something to build prematurely.

---

## Tips for specs that build first-try

- **Write acceptance criteria you could check by hand.** "Rejects empty titles with 400" beats "handle bad input."
- **Say what it does, not how.** Skip file names and libraries unless a specific choice is a real requirement.
- **Name the routes** if the feature has a UI or API — it's the cheapest accuracy win.
- **List non-goals.** They stop the agent from gold-plating.
- **Keep features small.** One coherent capability per spec; chain several specs for a big goal. Each one ends green before the next begins.
- **Let logic live in `lib/`.** It's what makes the feature testable and the build reliable.

When in doubt, start with the bare-bones shape and let the validation loop and `./forge explain` guide the rest.
