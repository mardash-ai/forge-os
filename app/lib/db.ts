// Postgres data-access layer. Thin queries that return already-mapped domain
// objects; all derived values reuse the pure helpers in lib/goals.ts so the API
// and UI can never disagree about progress.

import { Pool } from 'pg';
import type { Goal, GoalStatus, GoalWithProgress, GoalWithTasks, Task } from './goals';
import { progressPercent } from './goals';

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
    createdAt: new Date(r.created_at).toISOString(),
  };
}

const GOAL_COLS = 'id, title, description, status, created_at';
const TASK_COLS = 'id, goal_id, title, done, created_at';

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
  return { ...mapGoal(rows[0]), total: 0, done: 0, progress: 0 };
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
  const rows = await query<GoalRow>(
    `UPDATE goals SET status = $2 WHERE id = $1 RETURNING ${GOAL_COLS}`,
    [id, status],
  );
  return rows.length ? mapGoal(rows[0]) : null;
}

/** Adds a task to a goal, or null if the goal id is unknown. */
export async function addTask(goalId: string, title: string): Promise<Task | null> {
  if (!isUuid(goalId)) return null;
  const exists = await query<{ id: string }>(`SELECT id FROM goals WHERE id = $1`, [goalId]);
  if (exists.length === 0) return null;
  const rows = await query<TaskRow>(
    `INSERT INTO tasks (goal_id, title) VALUES ($1, $2) RETURNING ${TASK_COLS}`,
    [goalId, title],
  );
  return mapTask(rows[0]);
}

export async function completeTask(id: string): Promise<Task | null> {
  if (!isUuid(id)) return null;
  const rows = await query<TaskRow>(
    `UPDATE tasks SET done = true WHERE id = $1 RETURNING ${TASK_COLS}`,
    [id],
  );
  return rows.length ? mapTask(rows[0]) : null;
}
