// Postgres data-access layer. Thin queries that return already-mapped domain
// objects; all derived values reuse the pure helpers in lib/goals.ts so the API
// and UI can never disagree about progress.

import { Pool } from 'pg';
import type { Goal, GoalStatus, GoalWithProgress, GoalWithTasks, Task } from './goals';
import { progressPercent } from './goals';
import type { EventData, EventType, TimelineEvent } from './timeline';
import { bucketFor } from './schedule';
import { computeStreak, dateOf, periodStart, type Cadence, type StreakInfo } from './habits';
import {
  COLD_THRESHOLD_DAYS,
  activeNotifications,
  buildNotifications,
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
      -- Activity log. goal_id/task_id are plain refs (no FK): events are an
      -- immutable record and carry a denormalized snapshot in data, so they
      -- render even if the goal/task later changes.
      CREATE TABLE IF NOT EXISTS events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL,
        goal_id uuid,
        task_id uuid,
        data jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS events_created_at_idx ON events (created_at DESC);
      CREATE INDEX IF NOT EXISTS events_goal_id_idx ON events (goal_id);
      -- Only dismissals are stored; notifications themselves are derived live.
      CREATE TABLE IF NOT EXISTS dismissed_notifications (
        key text PRIMARY KEY,
        dismissed_at timestamptz NOT NULL DEFAULT now()
      );
      -- Agent runs: the first Agent Task resource. Each row records one
      -- capability invocation (kind) and the Artifact it produced (result).
      CREATE TABLE IF NOT EXISTS agent_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        goal_id uuid,
        kind text NOT NULL,
        status text NOT NULL,
        model text,
        result jsonb,
        error text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS agent_runs_goal_id_idx ON agent_runs (goal_id);
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
const EVENT_COLS = 'id, type, goal_id, task_id, data, created_at';

interface EventRow {
  id: string;
  type: string;
  goal_id: string | null;
  task_id: string | null;
  data: EventData | null;
  created_at: Date;
}
function mapEvent(r: EventRow): TimelineEvent {
  return {
    id: r.id,
    type: r.type as EventType,
    goalId: r.goal_id,
    taskId: r.task_id,
    data: r.data ?? {},
    createdAt: new Date(r.created_at).toISOString(),
  };
}

// Append an activity event. Best-effort: logging must never break the mutation
// that triggered it.
async function recordEvent(input: {
  type: EventType;
  goalId?: string | null;
  taskId?: string | null;
  data: EventData;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO events (type, goal_id, task_id, data) VALUES ($1, $2, $3, $4::jsonb)`,
      [input.type, input.goalId ?? null, input.taskId ?? null, JSON.stringify(input.data)],
    );
  } catch {
    // swallow — the activity log is not worth failing a real action over
  }
}

/** Recent events, newest first. Optional single-goal filter. */
export async function listEvents(opts: { goalId?: string; limit?: number } = {}): Promise<TimelineEvent[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  if (opts.goalId !== undefined) {
    if (!isUuid(opts.goalId)) return [];
    const rows = await query<EventRow>(
      `SELECT ${EVENT_COLS} FROM events WHERE goal_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [opts.goalId, limit],
    );
    return rows.map(mapEvent);
  }
  const rows = await query<EventRow>(
    `SELECT ${EVENT_COLS} FROM events ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(mapEvent);
}

/** All goals, newest first, each with derived progress. */
export async function listGoals(): Promise<GoalWithProgress[]> {
  const rows = await query<GoalRow & { total: string; done: string }>(`
    SELECT g.id, g.title, g.description, g.status, g.created_at,
           COUNT(t.id) AS total,
           COUNT(t.id) FILTER (WHERE t.done) AS done
    FROM goals g
    LEFT JOIN tasks t ON t.goal_id = g.id
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `);
  return rows.map((r) => {
    const total = Number(r.total);
    const done = Number(r.done);
    return { ...mapGoal(r), total, done, progress: progressPercent(done, total) };
  });
}

export async function createGoal(title: string, description: string): Promise<GoalWithProgress> {
  const rows = await query<GoalRow>(
    `INSERT INTO goals (title, description) VALUES ($1, $2) RETURNING ${GOAL_COLS}`,
    [title, description],
  );
  const goal = mapGoal(rows[0]);
  await recordEvent({ type: 'goal.created', goalId: goal.id, data: { goalTitle: goal.title } });
  return { ...goal, total: 0, done: 0, progress: 0 };
}

/** A goal with its tasks and derived progress, or null if the id is unknown. */
export async function getGoal(id: string): Promise<GoalWithTasks | null> {
  if (!isUuid(id)) return null;
  const goalRows = await query<GoalRow>(`SELECT ${GOAL_COLS} FROM goals WHERE id = $1`, [id]);
  if (goalRows.length === 0) return null;
  const taskRows = await query<TaskRow>(
    `SELECT ${TASK_COLS} FROM tasks WHERE goal_id = $1 ORDER BY created_at ASC`,
    [id],
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

export async function updateGoalStatus(id: string, status: GoalStatus): Promise<Goal | null> {
  if (!isUuid(id)) return null;
  // Capture the previous status in the same statement so we can log the transition.
  const rows = await query<GoalRow & { from_status: string }>(
    `WITH before AS (SELECT id, status AS from_status FROM goals WHERE id = $1)
     UPDATE goals g SET status = $2 FROM before
     WHERE g.id = before.id
     RETURNING g.id, g.title, g.description, g.status, g.created_at, before.from_status`,
    [id, status],
  );
  if (rows.length === 0) return null;
  const goal = mapGoal(rows[0]);
  if (rows[0].from_status !== goal.status) {
    await recordEvent({
      type: 'goal.status_changed',
      goalId: goal.id,
      data: { goalTitle: goal.title, from: rows[0].from_status as GoalStatus, to: goal.status },
    });
  }
  return goal;
}

/** Adds a task to a goal, or null if the goal id is unknown. */
export async function addTask(goalId: string, title: string): Promise<Task | null> {
  if (!isUuid(goalId)) return null;
  const goal = await query<{ id: string; title: string }>(
    `SELECT id, title FROM goals WHERE id = $1`,
    [goalId],
  );
  if (goal.length === 0) return null;
  const rows = await query<TaskRow>(
    `INSERT INTO tasks (goal_id, title) VALUES ($1, $2) RETURNING ${TASK_COLS}`,
    [goalId, title],
  );
  const task = mapTask(rows[0]);
  await recordEvent({
    type: 'task.added',
    goalId,
    taskId: task.id,
    data: { taskTitle: task.title, goalTitle: goal[0].title },
  });
  return task;
}

export async function completeTask(id: string): Promise<Task | null> {
  if (!isUuid(id)) return null;
  // Only log a completion when the task actually transitions to done.
  const rows = await query<TaskRow & { was_done: boolean }>(
    `WITH before AS (SELECT id, done AS was_done FROM tasks WHERE id = $1)
     UPDATE tasks t SET done = true FROM before
     WHERE t.id = before.id
     RETURNING t.id, t.goal_id, t.title, t.done, t.due_date::text AS due_date, t.created_at, before.was_done`,
    [id],
  );
  if (rows.length === 0) return null;
  const task = mapTask(rows[0]);
  if (!rows[0].was_done) {
    await recordEvent({
      type: 'task.completed',
      goalId: task.goalId,
      taskId: task.id,
      data: { taskTitle: task.title },
    });
  }
  return task;
}

/** Sets or clears (null) a task's due date, or null if the task id is unknown. */
export async function setTaskDueDate(id: string, dueDate: string | null): Promise<Task | null> {
  if (!isUuid(id)) return null;
  const rows = await query<TaskRow>(
    `UPDATE tasks SET due_date = $2 WHERE id = $1 RETURNING ${TASK_COLS}`,
    [id, dueDate],
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

/** Incomplete tasks that have a due date, with goal title, soonest due first. */
export async function listDueTasks(): Promise<DueTask[]> {
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
     WHERE t.done = false AND t.due_date IS NOT NULL
     ORDER BY t.due_date ASC`,
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

// ---- notifications (derived; only dismissals are persisted) ----

/** Active goals whose last activity (latest event, else creation) is older than
 *  the cold threshold — the "gone cold" candidates. Coldest first. */
async function listColdGoals(thresholdDays: number): Promise<ColdInput[]> {
  const rows = await query<{ id: string; title: string; last_activity: Date }>(
    `SELECT g.id, g.title, COALESCE(MAX(e.created_at), g.created_at) AS last_activity
     FROM goals g
     LEFT JOIN events e ON e.goal_id = g.id
     WHERE g.status = 'active'
     GROUP BY g.id, g.created_at
     HAVING COALESCE(MAX(e.created_at), g.created_at) < now() - ($1::int * interval '1 day')
     ORDER BY last_activity ASC`,
    [thresholdDays],
  );
  return rows.map((r) => ({
    goalId: r.id,
    goalTitle: r.title,
    lastActivity: new Date(r.last_activity).toISOString(),
  }));
}

async function listDismissedKeys(): Promise<Set<string>> {
  const rows = await query<{ key: string }>(`SELECT key FROM dismissed_notifications`);
  return new Set(rows.map((r) => r.key));
}

/** Record a dismissal. Idempotent, and tolerant of any key string. */
export async function dismissNotification(key: string): Promise<void> {
  await query(`INSERT INTO dismissed_notifications (key) VALUES ($1) ON CONFLICT (key) DO NOTHING`, [key]);
}

/** The live, non-dismissed notifications, most-urgent first. */
export async function listActiveNotifications(now: Date): Promise<Notification[]> {
  const [due, cold, dismissed] = await Promise.all([
    listDueTasks(),
    listColdGoals(COLD_THRESHOLD_DAYS),
    listDismissedKeys(),
  ]);
  const overdue = due
    .filter((t) => bucketFor(t.dueDate, now) === 'overdue')
    .map((t) => ({ id: t.id, goalId: t.goalId, goalTitle: t.goalTitle, title: t.title, dueDate: t.dueDate }));
  return activeNotifications(buildNotifications(overdue, cold, now), dismissed);
}

// ---- agent runs (the Agent Task / Artifact record) ----

/** A persisted record of one agent invocation and the artifact it produced. */
export interface AgentRun {
  id: string;
  goalId: string | null;
  kind: string;
  status: 'succeeded' | 'failed';
  model: string | null;
  result: unknown;
  error: string | null;
  createdAt: string;
}

interface AgentRunRow {
  id: string;
  goal_id: string | null;
  kind: string;
  status: string;
  model: string | null;
  result: unknown;
  error: string | null;
  created_at: Date;
}

/** Persist an agent run (succeeded or failed) and return it with its new id. */
export async function recordAgentRun(input: {
  goalId: string | null;
  kind: string;
  status: 'succeeded' | 'failed';
  model: string | null;
  result: unknown;
  error: string | null;
}): Promise<AgentRun> {
  const rows = await query<AgentRunRow>(
    `INSERT INTO agent_runs (goal_id, kind, status, model, result, error)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING id, goal_id, kind, status, model, result, error, created_at`,
    [
      input.goalId,
      input.kind,
      input.status,
      input.model,
      input.result === null || input.result === undefined ? null : JSON.stringify(input.result),
      input.error,
    ],
  );
  const r = rows[0];
  return {
    id: r.id,
    goalId: r.goal_id,
    kind: r.kind,
    status: r.status as AgentRun['status'],
    model: r.model,
    result: r.result ?? null,
    error: r.error,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

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

export async function createHabit(title: string, cadence: Cadence): Promise<Habit> {
  const rows = await query<HabitRow>(
    `INSERT INTO habits (title, cadence) VALUES ($1, $2) RETURNING id, title, cadence, created_at`,
    [title, cadence],
  );
  return mapHabit(rows[0]);
}

/** All habits, oldest first, each with its streak derived from check-ins as of `now`. */
export async function listHabits(now: Date): Promise<HabitWithStreak[]> {
  const habitRows = await query<HabitRow>(
    `SELECT id, title, cadence, created_at FROM habits ORDER BY created_at ASC`,
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
  return habitRows.map((row) => {
    const habit = mapHabit(row);
    return { ...habit, ...computeStreak(byHabit.get(row.id) ?? [], habit.cadence, nowISO) };
  });
}

async function getHabitRow(id: string): Promise<Habit | null> {
  if (!isUuid(id)) return null;
  const rows = await query<HabitRow>(
    `SELECT id, title, cadence, created_at FROM habits WHERE id = $1`,
    [id],
  );
  return rows.length ? mapHabit(rows[0]) : null;
}

async function refreshHabit(habit: Habit, now: Date): Promise<HabitWithStreak> {
  const rows = await query<{ period: string }>(
    `SELECT period::text AS period FROM habit_checkins WHERE habit_id = $1`,
    [habit.id],
  );
  return { ...habit, ...computeStreak(rows.map((r) => r.period), habit.cadence, now.toISOString()) };
}

/** Check in the current period (idempotent). Returns the fresh streak, or null if the id is unknown. */
export async function checkInHabit(id: string, now: Date): Promise<HabitWithStreak | null> {
  const habit = await getHabitRow(id);
  if (!habit) return null;
  const period = periodStart(dateOf(now.toISOString()), habit.cadence);
  await query(
    `INSERT INTO habit_checkins (habit_id, period) VALUES ($1, $2)
     ON CONFLICT (habit_id, period) DO NOTHING`,
    [id, period],
  );
  return refreshHabit(habit, now);
}

/** Undo the current period's check-in. Returns the fresh streak, or null if the id is unknown. */
export async function uncheckHabit(id: string, now: Date): Promise<HabitWithStreak | null> {
  const habit = await getHabitRow(id);
  if (!habit) return null;
  const period = periodStart(dateOf(now.toISOString()), habit.cadence);
  await query(`DELETE FROM habit_checkins WHERE habit_id = $1 AND period = $2`, [id, period]);
  return refreshHabit(habit, now);
}

/** Delete a habit (and its check-ins, via cascade). False if the id is unknown/malformed. */
export async function deleteHabit(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await query<{ id: string }>(`DELETE FROM habits WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}
