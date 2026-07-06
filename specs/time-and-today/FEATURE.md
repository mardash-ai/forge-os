# Feature: Time & Today

## Goal
Give tasks a **due date**, and add a **Today** view that answers *what should I work now?* —
incomplete tasks grouped by urgency (Overdue, Today, This week, Later) so time-sensitive work
surfaces instead of getting lost inside goals.

## Acceptance criteria

### Due dates on tasks
- [ ] `PATCH /api/tasks/{id}` with `{ "dueDate": "2026-07-10" }` sets that task's due date and
      returns the task including `dueDate`.
- [ ] `PATCH /api/tasks/{id}` with `{ "dueDate": null }` clears the due date.
- [ ] A malformed date (not `YYYY-MM-DD`, or not a real calendar date) is rejected with 400 and
      nothing changes.
- [ ] `PATCH` on an unknown/malformed task id returns 404.
- [ ] `GET /api/goals/{id}` includes each task's `dueDate` (string `YYYY-MM-DD` or `null`).
- [ ] Due dates persist across a restart.

### The Today focus view
- [ ] `GET /api/today` returns the **incomplete** tasks that have a due date, each with its
      `goalId`, `goalTitle`, `dueDate`, and a `bucket` of `overdue | today | week | later`,
      sorted by due date (most urgent first).
- [ ] `/today` page shows those tasks grouped under **Overdue**, **Today**, **This week**, and
      **Later** headings; empty buckets are omitted.
- [ ] A task **due today** is in Today (not Overdue); **due before today** is Overdue; **within
      the next 7 days** is This week; **beyond that** is Later.
- [ ] Completed tasks and tasks with no due date never appear in the Today view.
- [ ] **Overdue** tasks are visually distinguished (an urgency treatment), and each row shows a
      short due label (e.g. "Today", "Tomorrow", "3 days ago", "Jul 15") and links to its goal.
- [ ] A task can be **marked complete directly from the Today view**, and it then disappears
      from it.
- [ ] When the Today view has nothing due, it shows an inviting empty state.
- [ ] `/today` is reachable from the masthead nav (Floor · Today · Log).

## Details

- **Data (persists — Postgres):** add a nullable `due_date` (`date`) to tasks. `Task` gains
  `dueDate: string | null` (calendar date `YYYY-MM-DD`, no time-of-day).
- **Routes/pages:**
  - `/today` (page).
  - `PATCH /api/tasks/[id]` (set/clear `dueDate`).
  - `GET /api/today` (bucketed, incomplete, dated tasks).
  - `GET /api/goals/[id]` now returns `dueDate` on each task.
- **Where logic lives:** put the bucketing + labels in a pure `app/lib/schedule.ts`
  (`bucketFor(dueDate, now)`, `relativeDueLabel(dueDate, now)`, `isValidDateString`,
  `groupByBucket`) — directly unit-testable; the DB layer and page/route stay thin.
- **Non-goals:**
  - Goal target dates (goals stay dateless for now — a natural later addition).
  - Recurring/repeating due dates (that's the future **Habits** feature).
  - Reminders or notifications (that's the next feature — Today is the *view*; Reminders is the
    *push*).
  - Time-of-day, calendar/month grids, timezone handling beyond the server's local day,
    editing task titles.
- **Notes:**
  - "Today/Overdue" are computed against the server's local calendar day (same basis the
    Timeline already uses). A `date` column avoids time-of-day ambiguity.
  - The Today view should let you *act* (complete a task) and *navigate* (jump to the goal), not
    just read — it's a focus tool, not a report.
  - Show a task's due date on the goal detail task list too, with a way to set/clear it.
  - No new Timeline event types — setting a due date is quiet; completing a task already logs.
