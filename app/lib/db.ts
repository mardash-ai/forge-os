// Postgres data-access layer. Thin queries that return already-mapped domain
// objects; all derived values reuse the pure helpers in lib/goals.ts so the API
// and UI can never disagree about progress.

import { Pool } from 'pg';
import type { Goal, GoalStatus, GoalWithProgress, GoalWithTasks, Task } from './goals';
import { progressPercent } from './goals';
import { emitAppEvent, latestActivityBySubject } from './forge-events';
import { bucketFor } from './schedule';
import { computeStreak, dateOf, finalizeStreak, periodStart, type Cadence, type StreakInfo } from './habits';
import {
  COLD_THRESHOLD_DAYS,
  buildNotifications,
  coldGoals,
  type ColdInput,
  type Notification,
} from './notifications';

// The provisioned compose network reaches Postgres at host `postgres` with these
// fixed dev credentials; DATABASE_URL overrides when set (see .env.example).
const DEFAULT_URL = 'postgres://forge:forge@postgres:5432/forge_os';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL ?? DEFAULT_URL });
  }
  return pool;
}

// Create tables on first use (idempotent). Memoized so it runs once per process.
function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  const ready = getPool()
    .query(`
      CREATE TABLE IF NOT EXISTS goals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        title text NOT NULL,
        done boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      -- Added by the Time & Today feature (idempotent for existing tasks tables).
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date date;
      CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks (due_date);
      -- (Activity events moved to the Forge app event log — capability C3. The app
      -- emits/reads them via lib/forge-events.ts; there is no local events table.)
      -- (Notifications moved to the Forge notifications store — capability C4. The app
      -- derives WHICH conditions matter and upserts/clears/dismisses them via
      -- lib/forge-notifications.ts; there is no local dismissed_notifications table.)
      -- (Agent runs moved to the Forge agent runtime — capability C1. The app hands the
      -- Planner's prompt + JSON Schema to the platform's /capabilities/agent-run via
      -- lib/forge-agent.ts; the platform runs the model and stores the run + Artifact, so
      -- there is no local agent_runs table or recordAgentRun().)
      -- Habits + their per-period check-ins. Streaks are derived at read time
      -- (no scheduler yet — see PLATFORM_CAPABILITIES.md C2). One check-in per
      -- period is enforced so a streak can't be double-counted.
      CREATE TABLE IF NOT EXISTS habits (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        cadence text NOT NULL DEFAULT 'daily',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS habit_checkins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        habit_id uuid NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        period date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (habit_id, period)
      );
      CREATE INDEX IF NOT EXISTS habit_checkins_habit_id_idx ON habit_checkins (habit_id);
      -- Streak breaks recorded by the C2 scheduler at each period boundary. A row
      -- exists only for a period that was MISSED and ended a live run (streak > 0).
      -- UNIQUE (habit_id, period) makes the finalize job idempotent under retries.
      CREATE TABLE IF NOT EXISTS habit_streak_breaks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        habit_id uuid NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        period date NOT NULL,
        streak int NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (habit_id, period)
      );
      CREATE INDEX IF NOT EXISTS habit_streak_breaks_habit_id_idx ON habit_streak_breaks (habit_id);
      -- C11 · per-user ownership. Every app-domain row belongs to a C10 session user
      -- (owner_id = getSession().userId, an opaque platform id — TEXT, not a uuid).
      -- Children inherit their parent's owner (tasks←goals, check-ins/breaks←habits).
      -- Every read filters WHERE owner_id = <session user>, so a row owned by another
      -- user is simply absent (a by-id fetch of it is a 404, never a 403). Added
      -- nullable for an additive migration; every INSERT populates it and existing rows
      -- are backfilled at the C11 cutover.
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS owner_id text;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_id text;
      ALTER TABLE habits ADD COLUMN IF NOT EXISTS owner_id text;
      ALTER TABLE habit_checkins ADD COLUMN IF NOT EXISTS owner_id text;
      ALTER TABLE habit_streak_breaks ADD COLUMN IF NOT EXISTS owner_id text;
      CREATE INDEX IF NOT EXISTS goals_owner_id_idx ON goals (owner_id);
      CREATE INDEX IF NOT EXISTS tasks_owner_id_idx ON tasks (owner_id);
      CREATE INDEX IF NOT EXISTS habits_owner_id_idx ON habits (owner_id);
      CREATE INDEX IF NOT EXISTS habit_checkins_owner_id_idx ON habit_checkins (owner_id);
      CREATE INDEX IF NOT EXISTS habit_streak_breaks_owner_id_idx ON habit_streak_breaks (owner_id);
    `)
    .then(() => undefined)
    .catch((err: unknown) => {
      schemaReady = undefined; // let a later request retry the bootstrap
      throw err;
    });
  schemaReady = ready;
  return ready;
}

async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

/**
 * Readiness probe for the health contract (C6): a trivial round-trip to Postgres.
 * Deliberately skips `ensureSchema` — it's a connectivity check, not a bootstrap,
 * so it stays cheap and fails fast (throws) when the database is unreachable.
 */
export async function pingDb(): Promise<void> {
  await getPool().query('SELECT 1');
}

interface GoalRow {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: Date;
}
interface TaskRow {
  id: string;
  goal_id: string;
  title: string;
  done: boolean;
  due_date: string | null;
  created_at: Date;
}

function mapGoal(r: GoalRow): Goal {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status as GoalStatus,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
function mapTask(r: TaskRow): Task {
  return {
    id: r.id,
    goalId: r.goal_id,
    title: r.title,
    done: r.done,
    dueDate: r.due_date,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

const GOAL_COLS = 'id, title, description, status, created_at';
// due_date cast to text so pg returns "YYYY-MM-DD" instead of a tz-shifted Date.
const TASK_COLS = 'id, goal_id, title, done, due_date::text AS due_date, created_at';

// Activity events are emitted to / read from the Forge app event log (C3) via
// lib/forge-events.ts — see emitAppEvent below and listTimelineEvents there.

/** The owner's goals, newest first, each with derived progress. */
export async function listGoals(owner: string): Promise<GoalWithProgress[]> {
  const rows = await query<GoalRow & { total: string; done: string }>(`
    SELECT g.id, g.title, g.description, g.status, g.created_at,
           COUNT(t.id) AS total,
           COUNT(t.id) FILTER (WHERE t.done) AS done
    FROM goals g
    LEFT JOIN tasks t ON t.goal_id = g.id
    WHERE g.owner_id = $1
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `, [owner]);
  return rows.map((r) => {
    const total = Number(r.total);
    const done = Number(r.done);
    return { ...mapGoal(r), total, done, progress: progressPercent(done, total) };
  });
}

export async function createGoal(owner: string, title: string, description: string): Promise<GoalWithProgress> {
  const rows = await query<GoalRow>(
    `INSERT INTO goals (owner_id, title, description) VALUES ($1, $2, $3) RETURNING ${GOAL_COLS}`,
    [owner, title, description],
  );
  const goal = mapGoal(rows[0]);
  await emitAppEvent({ owner, type: 'goal.created', subject: goal.id, data: { goalTitle: goal.title } });
  return { ...goal, total: 0, done: 0, progress: 0 };
}

/** One of the OWNER's goals with its tasks and derived progress, or null if the id is
 *  unknown OR owned by another user (so a route maps it to a 404, never a 403). */
export async function getGoal(owner: string, id: string): Promise<GoalWithTasks | null> {
  if (!isUuid(id)) return null;
  const goalRows = await query<GoalRow>(
    `SELECT ${GOAL_COLS} FROM goals WHERE id = $1 AND owner_id = $2`,
    [id, owner],
  );
  if (goalRows.length === 0) return null;
  const taskRows = await query<TaskRow>(
    `SELECT ${TASK_COLS} FROM tasks WHERE goal_id = $1 AND owner_id = $2 ORDER BY created_at ASC`,
    [id, owner],
  );
  const tasks = taskRows.map(mapTask);
  const done = tasks.reduce((n, t) => (t.done ? n + 1 : n), 0);
  return {
    ...mapGoal(goalRows[0]),
    total: tasks.length,
    done,
    progress: progressPercent(done, tasks.length),
    tasks,
  };
}

export async function updateGoalStatus(owner: string, id: string, status: GoalStatus): Promise<Goal | null> {
  if (!isUuid(id)) return null;
  // Capture the previous status in the same statement so we can log the transition.
  // Scoped to the owner: another user's goal never matches, so it reads as "not found".
  const rows = await query<GoalRow & { from_status: string }>(
    `WITH before AS (SELECT id, status AS from_status FROM goals WHERE id = $1 AND owner_id = $3)
     UPDATE goals g SET status = $2 FROM before
     WHERE g.id = before.id
     RETURNING g.id, g.title, g.description, g.status, g.created_at, before.from_status`,
    [id, status, owner],
  );
  if (rows.length === 0) return null;
  const goal = mapGoal(rows[0]);
  if (rows[0].from_status !== goal.status) {
    await emitAppEvent({
      owner,
      type: 'goal.status_changed',
      subject: goal.id,
      data: { goalTitle: goal.title, from: rows[0].from_status as GoalStatus, to: goal.status },
    });
  }
  return goal;
}

/** Adds a task to one of the OWNER's goals, or null if the goal id is unknown or not theirs.
 *  The task inherits the goal's owner. */
export async function addTask(owner: string, goalId: string, title: string): Promise<Task | null> {
  if (!isUuid(goalId)) return null;
  const goal = await query<{ id: string; title: string }>(
    `SELECT id, title FROM goals WHERE id = $1 AND owner_id = $2`,
    [goalId, owner],
  );
  if (goal.length === 0) return null;
  const rows = await query<TaskRow>(
    `INSERT INTO tasks (goal_id, owner_id, title) VALUES ($1, $2, $3) RETURNING ${TASK_COLS}`,
    [goalId, owner, title],
  );
  const task = mapTask(rows[0]);
  await emitAppEvent({
    owner,
    type: 'task.added',
    subject: goalId,
    data: { taskTitle: task.title, goalTitle: goal[0].title, taskId: task.id },
  });
  return task;
}

export async function completeTask(owner: string, id: string): Promise<Task | null> {
  if (!isUuid(id)) return null;
  // Only log a completion when the task actually transitions to done. Scoped to the
  // owner: another user's task never matches, so it reads as "not found".
  const rows = await query<TaskRow & { was_done: boolean }>(
    `WITH before AS (SELECT id, done AS was_done FROM tasks WHERE id = $1 AND owner_id = $2)
     UPDATE tasks t SET done = true FROM before
     WHERE t.id = before.id
     RETURNING t.id, t.goal_id, t.title, t.done, t.due_date::text AS due_date, t.created_at, before.was_done`,
    [id, owner],
  );
  if (rows.length === 0) return null;
  const task = mapTask(rows[0]);
  if (!rows[0].was_done) {
    await emitAppEvent({
      owner,
      type: 'task.completed',
      subject: task.goalId,
      data: { taskTitle: task.title, taskId: task.id },
    });
  }
  return task;
}

/** Sets or clears (null) a task's due date, or null if the task id is unknown or not the
 *  owner's (so a route maps it to a 404, never a 403). */
export async function setTaskDueDate(owner: string, id: string, dueDate: string | null): Promise<Task | null> {
  if (!isUuid(id)) return null;
  const rows = await query<TaskRow>(
    `UPDATE tasks SET due_date = $2 WHERE id = $1 AND owner_id = $3 RETURNING ${TASK_COLS}`,
    [id, dueDate, owner],
  );
  return rows.length ? mapTask(rows[0]) : null;
}

/** An incomplete, dated task plus its goal's title — the Today view's unit. */
export interface DueTask {
  id: string;
  goalId: string;
  goalTitle: string;
  title: string;
  dueDate: string;
  createdAt: string;
}

/** The owner's incomplete tasks that have a due date, with goal title, soonest due first. */
export async function listDueTasks(owner: string): Promise<DueTask[]> {
  const rows = await query<{
    id: string;
    goal_id: string;
    goal_title: string;
    title: string;
    due_date: string;
    created_at: Date;
  }>(
    `SELECT t.id, t.goal_id, t.title, t.due_date::text AS due_date, t.created_at,
            g.title AS goal_title
     FROM tasks t
     JOIN goals g ON g.id = t.goal_id
     WHERE t.owner_id = $1 AND t.done = false AND t.due_date IS NOT NULL
     ORDER BY t.due_date ASC`,
    [owner],
  );
  return rows.map((r) => ({
    id: r.id,
    goalId: r.goal_id,
    goalTitle: r.goal_title,
    title: r.title,
    dueDate: r.due_date,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

// ---- notifications (derived; the platform store owns dismiss/clear — capability C4) ----

/** Active goals whose last activity (latest app event, else creation) is older than
 *  the cold threshold — the "gone cold" candidates. Coldest first. The latest-activity
 *  map comes from the C3 event log; the pure `coldGoals` rule filters + sorts. */
async function listColdGoals(owner: string, thresholdDays: number, now: Date): Promise<ColdInput[]> {
  const [goals, latest] = await Promise.all([
    query<{ id: string; title: string; created_at: Date }>(
      `SELECT id, title, created_at FROM goals WHERE owner_id = $1 AND status = 'active'`,
      [owner],
    ),
    latestActivityBySubject(owner),
  ]);
  return coldGoals(
    goals.map((g) => ({
      goalId: g.id,
      goalTitle: g.title,
      createdAt: new Date(g.created_at).toISOString(),
    })),
    latest,
    thresholdDays,
    now,
  );
}

/**
 * The currently-true notifications (overdue tasks + cold goals), most-urgent first — the
 * app's domain judgment of what deserves attention. Dismissal + storage now live in the
 * platform (capability C4): `lib/notification-inbox.ts` upserts these, clears the ones no
 * longer true, and renders the non-dismissed feed. This function does NOT filter dismissed.
 */
export async function deriveNotifications(owner: string, now: Date): Promise<Notification[]> {
  const [due, cold] = await Promise.all([
    listDueTasks(owner),
    listColdGoals(owner, COLD_THRESHOLD_DAYS, now),
  ]);
  const overdue = due
    .filter((t) => bucketFor(t.dueDate, now) === 'overdue')
    .map((t) => ({ id: t.id, goalId: t.goalId, goalTitle: t.goalTitle, title: t.title, dueDate: t.dueDate }));
  return buildNotifications(overdue, cold, now);
}

// (Agent runs moved to the Forge agent runtime — capability C1. The Planner endpoint calls
//  lib/forge-agent.ts → the platform's /capabilities/agent-run, which runs the model and stores
//  the run + Artifact. There is no local agent_runs table or recordAgentRun() to persist here.)

// ---- habits (streaks derived at read time — no scheduler yet, see C2) ----

export interface Habit {
  id: string;
  title: string;
  cadence: Cadence;
  createdAt: string;
}

/** A habit with its derived streak info for "now". */
export interface HabitWithStreak extends Habit, StreakInfo {}

interface HabitRow {
  id: string;
  title: string;
  cadence: string;
  created_at: Date;
}
function mapHabit(r: HabitRow): Habit {
  return {
    id: r.id,
    title: r.title,
    cadence: r.cadence === 'weekly' ? 'weekly' : 'daily',
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function createHabit(owner: string, title: string, cadence: Cadence): Promise<Habit> {
  const rows = await query<HabitRow>(
    `INSERT INTO habits (owner_id, title, cadence) VALUES ($1, $2, $3) RETURNING id, title, cadence, created_at`,
    [owner, title, cadence],
  );
  return mapHabit(rows[0]);
}

/** The owner's habits, oldest first, each with its streak derived from check-ins as of `now`. */
export async function listHabits(owner: string, now: Date): Promise<HabitWithStreak[]> {
  const habitRows = await query<HabitRow>(
    `SELECT id, title, cadence, created_at FROM habits WHERE owner_id = $1 ORDER BY created_at ASC`,
    [owner],
  );
  if (habitRows.length === 0) return [];
  const checkins = await query<{ habit_id: string; period: string }>(
    `SELECT habit_id, period::text AS period FROM habit_checkins WHERE owner_id = $1`,
    [owner],
  );
  const byHabit = new Map<string, string[]>();
  for (const c of checkins) {
    const list = byHabit.get(c.habit_id);
    if (list) list.push(c.period);
    else byHabit.set(c.habit_id, [c.period]);
  }
  const nowISO = now.toISOString();
  return habitRows.map((row) => {
    const habit = mapHabit(row);
    return { ...habit, ...computeStreak(byHabit.get(row.id) ?? [], habit.cadence, nowISO) };
  });
}

async function getHabitRow(owner: string, id: string): Promise<Habit | null> {
  if (!isUuid(id)) return null;
  const rows = await query<HabitRow>(
    `SELECT id, title, cadence, created_at FROM habits WHERE id = $1 AND owner_id = $2`,
    [id, owner],
  );
  return rows.length ? mapHabit(rows[0]) : null;
}

async function refreshHabit(owner: string, habit: Habit, now: Date): Promise<HabitWithStreak> {
  const rows = await query<{ period: string }>(
    `SELECT period::text AS period FROM habit_checkins WHERE habit_id = $1 AND owner_id = $2`,
    [habit.id, owner],
  );
  return { ...habit, ...computeStreak(rows.map((r) => r.period), habit.cadence, now.toISOString()) };
}

/** Check in the current period for one of the OWNER's habits (idempotent). Returns the fresh
 *  streak, or null if the id is unknown or not theirs. The check-in inherits the habit's owner. */
export async function checkInHabit(owner: string, id: string, now: Date): Promise<HabitWithStreak | null> {
  const habit = await getHabitRow(owner, id);
  if (!habit) return null;
  const period = periodStart(dateOf(now.toISOString()), habit.cadence);
  await query(
    `INSERT INTO habit_checkins (habit_id, owner_id, period) VALUES ($1, $2, $3)
     ON CONFLICT (habit_id, period) DO NOTHING`,
    [id, owner, period],
  );
  return refreshHabit(owner, habit, now);
}

/** Undo the current period's check-in. Returns the fresh streak, or null if the id is unknown
 *  or not the owner's. */
export async function uncheckHabit(owner: string, id: string, now: Date): Promise<HabitWithStreak | null> {
  const habit = await getHabitRow(owner, id);
  if (!habit) return null;
  const period = periodStart(dateOf(now.toISOString()), habit.cadence);
  await query(`DELETE FROM habit_checkins WHERE habit_id = $1 AND owner_id = $2 AND period = $3`, [id, owner, period]);
  return refreshHabit(owner, habit, now);
}

/** Delete one of the OWNER's habits (and its check-ins, via cascade). False if the id is
 *  unknown, malformed, or owned by another user. */
export async function deleteHabit(owner: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await query<{ id: string }>(
    `DELETE FROM habits WHERE id = $1 AND owner_id = $2 RETURNING id`,
    [id, owner],
  );
  return rows.length > 0;
}

/** A streak break recorded at a period boundary by the finalize job. */
export interface StreakBreak {
  habitId: string;
  title: string;
  cadence: Cadence;
  period: string; // the missed period-start that ended the run
  streak: number; // the length of the run it broke
}

/**
 * Settle the period that just closed for every habit — the C2 scheduler's boundary
 * job. For each habit whose closed period was *missed* and ended a live streak, it
 * records one durable `habit_streak_breaks` marker (idempotent) and returns the
 * breaks newly recorded on this run. Completed or no-streak periods write nothing.
 *
 * Idempotent: safe to call repeatedly (scheduler retries, double fires) — the
 * UNIQUE(habit_id, period) constraint means a re-run records nothing new. Read-time
 * `computeStreak` remains the source of truth for the live streak; this only adds
 * the persisted history of *when* streaks broke.
 */
export async function finalizeHabitStreaks(now: Date): Promise<StreakBreak[]> {
  // The C2 scheduler runs this SYSTEM-WIDE (a service token, no user session), so it
  // settles EVERY user's habits. It reads across owners deliberately and stamps each
  // recorded break with its own habit's owner (children inherit their parent's owner).
  const habitRows = await query<HabitRow & { owner_id: string | null }>(
    `SELECT id, owner_id, title, cadence, created_at FROM habits ORDER BY created_at ASC`,
  );
  if (habitRows.length === 0) return [];
  const checkins = await query<{ habit_id: string; period: string }>(
    `SELECT habit_id, period::text AS period FROM habit_checkins`,
  );
  const byHabit = new Map<string, string[]>();
  for (const c of checkins) {
    const list = byHabit.get(c.habit_id);
    if (list) list.push(c.period);
    else byHabit.set(c.habit_id, [c.period]);
  }

  const nowISO = now.toISOString();
  const recorded: StreakBreak[] = [];
  for (const row of habitRows) {
    const habit = mapHabit(row);
    const { period, brokenStreak } = finalizeStreak(byHabit.get(row.id) ?? [], habit.cadence, nowISO);
    // Only a missed period that ended a live run is worth persisting.
    if (brokenStreak <= 0) continue;
    // Don't finalize periods before the habit existed.
    if (period < periodStart(dateOf(habit.createdAt), habit.cadence)) continue;
    const ins = await query<{ id: string }>(
      `INSERT INTO habit_streak_breaks (habit_id, owner_id, period, streak) VALUES ($1, $2, $3, $4)
       ON CONFLICT (habit_id, period) DO NOTHING RETURNING id`,
      [row.id, row.owner_id, period, brokenStreak],
    );
    if (ins.length > 0) {
      recorded.push({ habitId: habit.id, title: habit.title, cadence: habit.cadence, period, streak: brokenStreak });
    }
  }
  return recorded;
}
