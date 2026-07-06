# Feature: Goals & Tasks — the forge-os core (v1)

## Goal
forge-os is a personal operating system for running your life, and everything in
it revolves around **Goals**. In this initial version a user can create a Goal,
describe what they want to achieve, break it into concrete **Tasks**, check those
tasks off, and see how far along each Goal is. This establishes the core domain
(Goal → Task → progress) that later capabilities — scheduling, agents, research —
will build on.

## Acceptance criteria

### Goals
- [ ] `GET /api/goals` returns all goals as JSON, each including its computed
      `progress` (an integer 0–100 = percent of its tasks that are done).
- [ ] `POST /api/goals` with `{ "title": "...", "description": "..." }` creates a
      goal and returns it with an `id`, `status: "active"`, `progress: 0`, and a
      `createdAt` timestamp. `description` is optional.
- [ ] Goal titles are trimmed; an empty or whitespace-only title is rejected with
      400 and no goal is created.
- [ ] `GET /api/goals/{id}` returns the goal together with its tasks (e.g.
      `{ ...goal, tasks: [...] }`). An unknown id returns 404.
- [ ] `PATCH /api/goals/{id}` with `{ "status": "achieved" }` (or `"active"` /
      `"archived"`) updates the goal's status and returns the updated goal. Any
      other status value is rejected with 400.

### Tasks
- [ ] `POST /api/goals/{id}/tasks` with `{ "title": "..." }` adds a task to that
      goal and returns it with an `id`, `goalId`, `done: false`, and `createdAt`.
      Adding a task to an unknown goal id returns 404.
- [ ] Task titles are trimmed; an empty or whitespace-only title is rejected with
      400 and no task is created.
- [ ] `POST /api/tasks/{id}/complete` marks that task `done: true` and returns it.
      An unknown task id returns 404.
- [ ] After a task is completed, the parent goal's `progress` reflects the change
      (e.g. a goal with 4 tasks, 1 done, reports `progress: 25`).
- [ ] A goal with zero tasks reports `progress: 0` (no divide-by-zero).

### Persistence
- [ ] Goals and tasks **survive an app restart** — they are stored in Postgres,
      not in memory. Restarting the app and re-fetching `GET /api/goals` returns
      the previously created goals.

### UI
- [ ] The `/` (home) page lists all goals with their title, status, and a visible
      progress indicator (e.g. "3/4 · 75%" or a progress bar).
- [ ] The `/goals/{id}` page shows the goal's title, description, and status, lists
      its tasks showing which are done, and provides a way to add a task and to
      mark a task complete.

## Details

- **Data (persisted in Postgres — must survive restarts):**
  - `Goal { id: string; title: string; description: string; status: "active" | "achieved" | "archived"; createdAt: string }`
  - `Task { id: string; goalId: string; title: string; done: boolean; createdAt: string }`
  - `progress` is **derived** (percent of the goal's tasks that are done, rounded
    to an integer), not a stored column.

- **Routes/pages:**
  - Pages: `/` (goal dashboard), `/goals/[id]` (goal detail with tasks).
  - API:
    - `/api/goals` — `GET` (list, with progress), `POST` (create).
    - `/api/goals/[id]` — `GET` (goal + tasks), `PATCH` (update status).
    - `/api/goals/[id]/tasks` — `POST` (add task).
    - `/api/tasks/[id]/complete` — `POST` (mark done).

- **Where logic lives (so it's unit-testable in Node without a DB):**
  Keep the pure rules in `lib/` as pure functions, separate from Postgres I/O:
  - title validation/normalization (trim + reject empty),
  - `computeProgress(tasks)` → 0–100 integer (0 when there are no tasks),
  - allowed status values / status transition guard.
  Persistence (the Postgres queries) is a thin data-access layer that the API
  routes call; the routes stay thin wrappers over `lib/` + the data layer.

- **Non-goals (do not build in v1):**
  - Editing or deleting goals/tasks, task ordering/reordering, due dates or
    reminders.
  - Projects, Documents, Meetings, Contacts, Habits, Journal, or any other
    resource from the broader forge-os vision — Goals and Tasks only.
  - Authentication / multiple users (single implicit user for now).
  - AI agents, scheduling, search, notifications — later capabilities.
  - Pagination, filtering, or search over goals.

- **Notes:**
  - `progress` should always be computed from the current tasks so the API and UI
    never disagree.
  - Provision Postgres before implementing:
    `./forge provision --app forge-os --with-postgres`.
  - Definition of done: `./forge lint` = 0 problems, `./forge build` = succeeded,
    `./forge test` = succeeded (0 failed), and every acceptance criterion above
    holds. Confirm the surface area with `./forge inspect routes --app forge-os`.
