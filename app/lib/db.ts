// Postgres data-access layer. Thin queries that return already-mapped domain
// objects; all derived values reuse the pure helpers in lib/goals.ts so the API
// and UI can never disagree about progress.

import { Pool } from 'pg';
import type { Goal, GoalStatus, GoalWithProgress, GoalWithTasks, Task } from './goals';
import { progressPercent } from './goals';
import type { EventData, EventType, TimelineEvent } from './timeline';

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
