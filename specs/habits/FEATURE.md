# Feature: Habits — recurring goals with streaks

## Goal
Track recurring habits (daily or weekly) that you check in each period, and keep a **streak** of
consecutive completed periods. A streak is a fire you keep lit: it grows as you stay consistent
and goes cold the moment you miss a period — so the app answers *"am I keeping this up?"* at a
glance.

## Acceptance criteria

### The Habit resource
- [ ] `POST /api/habits` with `{ title, cadence }` creates a habit. `cadence` is `daily` or
      `weekly`. Empty/whitespace title → **400**; a cadence other than daily/weekly → **400**.
- [ ] `GET /api/habits` returns each habit with its **derived** `{ streak, longestStreak,
      doneThisPeriod }` for the current period (computed at read time — see *the C2 stopgap*).
- [ ] `DELETE /api/habits/{id}` removes a habit and its check-ins; unknown/malformed id → **404**.

### Checking in (per period)
- [ ] `POST /api/habits/{id}/checkin` marks the **current period** complete. It is **idempotent**
      — a second check-in for the same period is a no-op and still returns 200. Unknown id → 404.
- [ ] `DELETE /api/habits/{id}/checkin` undoes the current period's check-in (fix a mis-tap).
- [ ] After a check-in, the habit's `doneThisPeriod` is true and the streak reflects it.

### Streaks (the derived rule)
- [ ] **Streak** = the number of consecutive completed periods ending at the **current** period
      (if done) or the **previous** period (if the current one isn't done yet — today still
      counts as "pending", not "missed").
- [ ] Missing a whole period **resets the streak to 0** — verifiable by seeding check-ins with a
      gap. `longestStreak` records the best run.
- [ ] Daily periods are calendar days; weekly periods are ISO weeks (Mon-start). Check-ins are
      one-per-period (a unique constraint), so double check-ins can't inflate a streak.

### Persistence
- [ ] Habits, check-ins, and therefore streaks **survive a restart** (Postgres).

### UI
- [ ] A `/habits` page lists habits, each showing its streak **as heat** (cold when broken,
      hotter as it grows), the cadence, whether it's due this period, and a **check-in control**.
- [ ] A form creates a habit (title + cadence). The nav links to Habits.
- [ ] Checking in updates the streak and the fire immediately; empty state invites the first habit.

## Details

- **Data (persists — Postgres):**
  - `habits` (`id uuid`, `title text`, `cadence text`, `created_at timestamptz`).
  - `habit_checkins` (`id uuid`, `habit_id uuid` → habits ON DELETE CASCADE, `period date`,
    `created_at timestamptz`, **UNIQUE(habit_id, period)**). `period` is the period-start date
    (the day for daily; the Monday for weekly).
- **Where logic lives:**
  - `app/lib/habits.ts` — **pure**: `Cadence`, period math (`periodStart`, `previousPeriodStart`),
    and `computeStreak(completedPeriods, cadence, now)`. Unit-tested hard (this is the feature).
  - `app/lib/db.ts` — the tables + `createHabit`, `listHabits(now)`, `checkInHabit(id, now)`,
    `uncheckHabit(id, now)`, `deleteHabit(id)`. `listHabits` does the read-time derivation.
- **Routes/pages:** `GET|POST /api/habits`; `POST|DELETE /api/habits/[id]/checkin`;
  `DELETE /api/habits/[id]`; the `/habits` page.
- **Non-goals (v1):**
  - **Reminders / push for habits** — "you're about to break your streak" needs a real scheduler
    to fire while you're away. That's the **C2** gap this feature exists to prove; not built here.
  - Arbitrary cadences (every-N-days, specific weekdays), habit editing, per-habit history charts,
    Timeline/Notifications integration, auth.
- **The C2 stopgap (record this pressure):** there is no background job, so the "reset" is not an
  event that fires at period boundaries — it is **derived at read time** from the check-in history
  relative to `now` (exactly like Reminders derives). The streak is always correct on the next
  read, but nothing *happens* at the boundary (no push, no finalize). This is the concrete
  evidence for **C2 · Scheduler / background jobs** in `PLATFORM_CAPABILITIES.md`.
