# Feature: Reminders & Notifications

## Goal
Surface the things that need attention — tasks that have gone **overdue** and goals that have
gone **cold** (no activity in a while) — as **notifications** you can see at a glance, act on,
and dismiss, so nothing important quietly slips.

## Acceptance criteria

### What generates a notification (derived from current state)
- [ ] Each incomplete task whose due date is **before today** produces an **overdue**
      notification.
- [ ] Each **active** goal with **no activity for 7+ days** produces a **cold-goal**
      notification. "Activity" = the goal's most recent Timeline event, or its creation time if
      it has none.
- [ ] Notifications are **derived from current data** — completing an overdue task, or working
      a cold goal, makes its notification disappear on the next read (no stale notifications).

### Reading & dismissing
- [ ] `GET /api/notifications` returns the active (non-dismissed) notifications as JSON, each
      with a stable `key`, a `kind` (`overdue` | `cold-goal`), a human `message`, the related
      `goalId` (and `taskId` for overdue), and ordered most-urgent first (overdue before cold,
      then by how overdue / how cold).
- [ ] `POST /api/notifications/dismiss` with `{ "key": "..." }` marks that notification
      dismissed; it no longer appears in `GET /api/notifications`. An unknown/garbage key is
      accepted idempotently (no error).
- [ ] Dismissals **persist across a restart**.
- [ ] A dismissed notification stays gone while its condition holds; if the condition clears
      and later recurs with a new key, it can surface again.

### The inbox
- [ ] `/notifications` lists the active notifications, overdue first, each showing what's
      wrong, a link to the related goal, and a **Dismiss** control that removes it in place.
- [ ] Overdue and cold notifications are **visually distinct** (hot vs. cold).
- [ ] An empty inbox shows an "all clear" state.
- [ ] The masthead nav shows a **count of active notifications** and links to `/notifications`.

## Details
- **Data (persists — Postgres):** a `dismissed_notifications` table
  (`key text primary key, dismissed_at timestamptz default now()`). Notifications themselves
  are **derived**, never stored.
- **Routes/pages:** `/notifications` (page); `GET /api/notifications`;
  `POST /api/notifications/dismiss`.
- **Where logic lives:** `app/lib/notifications.ts` — pure builders over inputs + `now`: stable
  keys (`overdue:<taskId>`, `cold:<goalId>`), messages, ordering, and the cold threshold (7
  days). Unit-tested. DB queries (overdue tasks, cold goals, dismissed keys) live in
  `lib/db.ts`; the cold-goal query reuses the **events** table from the Timeline feature.
- **Non-goals:**
  - **Actually pushing** notifications — email, browser/OS push, daily digests — or generating
    them on a schedule while you're away. That's exactly the capability this feature reveals
    Forge still lacks (**background jobs / a scheduler**). v1 computes notifications when you
    look.
  - Per-notification snooze, notification preferences/settings, mark-all-read, or history.
  - Due-**today** reminders — those live on the Today board. Notifications push what's *wrong*
    (overdue, cold), not what's merely upcoming.
- **Notes:**
  - "Overdue" and "cold" are computed against the server's local day (same basis as
    Today/Timeline).
  - Reuse the app's color languages: **overdue = ember-red** (as on Today); **cold goal = the
    cold end of the heat ramp** (a goal that lost its heat). The notification's color states its
    nature.
  - This is the wind-tunnel feature for **background jobs**: everything here is read-time; the
    natural next Forge capability is a scheduler that evaluates and *pushes* these without the
    user opening the app.
