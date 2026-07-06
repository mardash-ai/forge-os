# Feature: Timeline

## Goal
forge-os records what you do — creating a Goal, adding or completing a Task, moving a Goal
through its lifecycle — as a stream of **Events**, and shows them on a **Timeline** so you can
see your momentum at a glance. (The app emitting its own Events mirrors how Forge records
every action internally.)

## Acceptance criteria

### Events are recorded automatically (going forward)
- [ ] Creating a goal records a `goal.created` event.
- [ ] Adding a task to a goal records a `task.added` event.
- [ ] Completing a task records a `task.completed` event.
- [ ] Changing a goal's status records a `goal.status_changed` event that captures both the
      `from` and `to` status.
- [ ] Events are emitted by the existing actions themselves — there is no separate "log this"
      call from the client, so the log always reflects what actually happened.

### Reading events
- [ ] `GET /api/events` returns events as JSON, **newest first**, each with: `id`, `type`, a
      human-readable `summary`, the related `goalId` (and `taskId` when relevant), and a
      `createdAt` timestamp.
- [ ] `GET /api/events?goalId={id}` returns only that goal's events, newest first. An unknown
      or malformed `goalId` returns an empty list (`[]`), not an error.
- [ ] Events persist across a restart.

### The Timeline page
- [ ] `/timeline` lists recent events newest-first, **grouped by day** (Today, Yesterday, then
      the calendar date).
- [ ] Each entry shows what happened — e.g. "Completed 'Provision Postgres'", "Forged 'Ship
      forge-os v1'" — and links to the related goal.
- [ ] An empty timeline (no events yet) shows an inviting empty state, not a blank page.
- [ ] There's a way to reach `/timeline` from the home masthead (and back).

## Details

- **Data (persists across restarts — Postgres):**
  `Event { id: string; type: 'goal.created' | 'goal.status_changed' | 'task.added' |
  'task.completed'; goalId: string | null; taskId: string | null; data: object; createdAt:
  string }`. `data` holds a small denormalized **snapshot** for rendering (e.g. `goalTitle`,
  `taskTitle`, `from`, `to`). Stored in a reusable **`events` table** — the activity backbone
  later features build on.
- **Routes/pages:** `/timeline` (page); `GET /api/events` (list; optional `?goalId=` filter).
- **Non-goals:**
  - Editing or deleting events.
  - Backfilling history for goals/tasks created before this feature — the timeline starts now.
  - Per-goal activity panels on the goal detail page; real-time/live updates; pagination or
    infinite scroll (show the most recent ~100).
  - Read/seen state or notifications — that's the later **Reminders** feature.
- **Notes:**
  - Emit events at the mutation points (create goal, add task, complete task, change status)
    so the log can't drift from reality.
  - The `summary` is a **pure function over `type` + `data`**, so the API and UI render events
    identically — and it's directly unit-testable.
  - Snapshot the titles/status in `data` so the feed still renders if the underlying goal/task
    later changes; links stay resolvable via `goalId`.
