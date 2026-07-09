// Postgres data-access layer. Thin queries that return already-mapped domain
// objects; all derived values reuse the pure helpers in lib/goals.ts so the API
// and UI can never disagree about progress.

import { Pool } from 'pg';
import type { Goal, GoalStatus, GoalWithProgress, GoalWithTasks, Task } from './goals';
import { progressPercent } from './goals';
import type {
  Project,
  ProjectStatus,
  ProjectWithGoals,
  ProjectWithRollup,
} from './projects';
import { rollupFromCounts, rollupProgress } from './projects';
import type { Area, AreaOption, AreaWithCounts, TaggableKind } from './areas';
import { emitAppEvent, latestActivityBySubject } from './forge-events';
import { deleteDoc, indexDoc, type IndexDoc } from './forge-search';
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
      -- A1 · Projects. A Project groups related Goals and rolls up their progress/heat.
      -- Mirrors the goals table exactly, owner-scoped identically (owner_id = the C10
      -- session userId; every query filters WHERE owner_id = <session user>). Additive +
      -- idempotent like the rest of ensureSchema (re-run safe).
      CREATE TABLE IF NOT EXISTS projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id text,
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS projects_owner_id_idx ON projects (owner_id);
      -- A Goal belongs to AT MOST ONE Project (nullable FK). ON DELETE SET NULL so
      -- deleting a Project never deletes its Goals — the FK is nulled and the Goals
      -- survive unaffiliated. (Archiving a Project nulls the FK explicitly too; see
      -- setProjectStatus.) This runs AFTER the projects table exists so the ref resolves.
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS goals_project_id_idx ON goals (project_id);
      -- A2 · Areas (life domains). An Area is a user-defined life domain (Health, Career,
      -- Finance…) that Goals, Habits, and Projects can be tagged to. Mirrors the projects
      -- table shape, owner-scoped identically (owner_id = the C10 session userId; every query
      -- filters WHERE owner_id = <session user>). Additive + idempotent like the rest of
      -- ensureSchema (re-run safe). The table is created FIRST so the area_id refs below resolve.
      CREATE TABLE IF NOT EXISTS areas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id text,
        name text NOT NULL,
        color text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS areas_owner_id_idx ON areas (owner_id);
      -- A Goal / Habit / Project is tagged to AT MOST ONE Area (nullable FK). ON DELETE SET
      -- NULL so deleting an Area NEVER deletes the tagged resource — the FK is nulled and the
      -- resource survives untagged. Add-column-idempotent; runs AFTER the areas table exists.
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas(id) ON DELETE SET NULL;
      ALTER TABLE habits ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas(id) ON DELETE SET NULL;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS goals_area_id_idx ON goals (area_id);
      CREATE INDEX IF NOT EXISTS habits_area_id_idx ON habits (area_id);
      CREATE INDEX IF NOT EXISTS projects_area_id_idx ON projects (area_id);
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

/**
 * Fire a best-effort search-index write (capability C19) alongside a domain mutation. Like
 * the C3 emit, indexing must NEVER break — or fail — the mutation that triggered it: the
 * forge-search client already swallows network errors, and this guard also absorbs an
 * unexpected throw, so a search-index hiccup can't turn a real write into a 500.
 */
function indexBestEffort(p: Promise<void>): Promise<void> {
  return p.then(
    () => undefined,
    () => undefined,
  );
}

// ---- C19 search-index document builders (one per indexed domain kind) --------------------
// Shape each domain object into the platform's index document. `title` is the primary match
// field; `body` carries the longer text (goal/project descriptions); `attrs` carry the ids the
// hit needs to link back (a task's goalId) plus light metadata. owner = the C10 session userId,
// so the platform scopes every write and read to the caller (C11). Function declarations so the
// mutations above can call them regardless of source order.
function goalDoc(owner: string, goal: Goal): IndexDoc {
  return {
    owner,
    type: 'goal',
    id: goal.id,
    title: goal.title,
    body: goal.description,
    attrs: { status: goal.status, projectId: goal.projectId, areaId: goal.areaId },
    created_at: goal.createdAt,
  };
}
function taskDoc(owner: string, task: Task): IndexDoc {
  return {
    owner,
    type: 'task',
    id: task.id,
    title: task.title,
    attrs: { goalId: task.goalId, done: task.done },
    created_at: task.createdAt,
  };
}
function projectDoc(owner: string, project: Project): IndexDoc {
  return {
    owner,
    type: 'project',
    id: project.id,
    title: project.title,
    body: project.description,
    attrs: { status: project.status, areaId: project.areaId },
    created_at: project.createdAt,
  };
}
function areaDoc(owner: string, area: Area): IndexDoc {
  return {
    owner,
    type: 'area',
    id: area.id,
    title: area.name,
    attrs: { color: area.color },
    created_at: area.createdAt,
  };
}
function habitDoc(owner: string, habit: Habit): IndexDoc {
  return {
    owner,
    type: 'habit',
    id: habit.id,
    title: habit.title,
    attrs: { cadence: habit.cadence, areaId: habit.areaId },
    created_at: habit.createdAt,
  };
}

interface GoalRow {
  id: string;
  title: string;
  description: string;
  status: string;
  project_id: string | null;
  area_id: string | null;
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
    projectId: r.project_id,
    areaId: r.area_id,
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

const GOAL_COLS = 'id, title, description, status, project_id, area_id, created_at';
// due_date cast to text so pg returns "YYYY-MM-DD" instead of a tz-shifted Date.
const TASK_COLS = 'id, goal_id, title, done, due_date::text AS due_date, created_at';

// Activity events are emitted to / read from the Forge app event log (C3) via
// lib/forge-events.ts — see emitAppEvent below and listTimelineEvents there.

/** The owner's goals, newest first, each with derived progress. Optionally filtered to one
 *  Area (A2) — owner-scoped, so a foreign or malformed area id simply matches nothing. Each
 *  row carries its Area's name/color (LEFT JOIN) for the card chip. */
export async function listGoals(owner: string, areaId?: string | null): Promise<GoalWithProgress[]> {
  const filterArea = areaId && isUuid(areaId) ? areaId : null;
  const rows = await query<GoalRow & { total: string; done: string; area_name: string | null; area_color: string | null }>(`
    SELECT g.id, g.title, g.description, g.status, g.project_id, g.area_id, g.created_at,
           ar.name AS area_name, ar.color AS area_color,
           COUNT(t.id) AS total,
           COUNT(t.id) FILTER (WHERE t.done) AS done
    FROM goals g
    LEFT JOIN tasks t ON t.goal_id = g.id
    LEFT JOIN areas ar ON ar.id = g.area_id
    WHERE g.owner_id = $1${filterArea ? ' AND g.area_id = $2' : ''}
    GROUP BY g.id, ar.name, ar.color
    ORDER BY g.created_at DESC
  `, filterArea ? [owner, filterArea] : [owner]);
  return rows.map((r) => {
    const total = Number(r.total);
    const done = Number(r.done);
    return {
      ...mapGoal(r),
      total,
      done,
      progress: progressPercent(done, total),
      areaName: r.area_name,
      areaColor: r.area_color,
    };
  });
}

export async function createGoal(owner: string, title: string, description: string): Promise<GoalWithProgress> {
  const rows = await query<GoalRow>(
    `INSERT INTO goals (owner_id, title, description) VALUES ($1, $2, $3) RETURNING ${GOAL_COLS}`,
    [owner, title, description],
  );
  const goal = mapGoal(rows[0]);
  await emitAppEvent({ owner, type: 'goal.created', subject: goal.id, data: { goalTitle: goal.title } });
  // C19 · make the new goal searchable (title + description). Best-effort: never blocks the write.
  await indexBestEffort(indexDoc(goalDoc(owner, goal)));
  return { ...goal, total: 0, done: 0, progress: 0 };
}

/** One of the OWNER's goals with its tasks and derived progress, or null if the id is
 *  unknown OR owned by another user (so a route maps it to a 404, never a 403). */
export async function getGoal(owner: string, id: string): Promise<GoalWithTasks | null> {
  if (!isUuid(id)) return null;
  // LEFT JOIN the project + area so the detail can show/link its Project (A1) and its Area
  // (A2) chip in one round-trip.
  const goalRows = await query<
    GoalRow & { project_title: string | null; area_name: string | null; area_color: string | null }
  >(
    `SELECT g.id, g.title, g.description, g.status, g.project_id, g.area_id, g.created_at,
            p.title AS project_title, ar.name AS area_name, ar.color AS area_color
     FROM goals g
     LEFT JOIN projects p ON p.id = g.project_id
     LEFT JOIN areas ar ON ar.id = g.area_id
     WHERE g.id = $1 AND g.owner_id = $2`,
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
    projectTitle: goalRows[0].project_title,
    areaName: goalRows[0].area_name,
    areaColor: goalRows[0].area_color,
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
     RETURNING g.id, g.title, g.description, g.status, g.project_id, g.area_id, g.created_at, before.from_status`,
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
  // C19 · make the new task searchable (title; attrs.goalId links the hit to its goal page).
  await indexBestEffort(indexDoc(taskDoc(owner, task)));
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

/** The owner's incomplete tasks that have a due date, with goal title, soonest due first.
 *  Optionally filtered to one Area (A2) by the task's goal's area — owner-scoped, so a
 *  foreign or malformed area id simply matches nothing. */
export async function listDueTasks(owner: string, areaId?: string | null): Promise<DueTask[]> {
  const filterArea = areaId && isUuid(areaId) ? areaId : null;
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
     WHERE t.owner_id = $1 AND t.done = false AND t.due_date IS NOT NULL${filterArea ? ' AND g.area_id = $2' : ''}
     ORDER BY t.due_date ASC`,
    filterArea ? [owner, filterArea] : [owner],
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

// ---- projects (A1 · group related goals + roll up their progress/heat) ----
// Owner-scoped identically to goals/tasks/habits: every project row carries owner_id =
// the session userId, and EVERY query filters WHERE owner_id = $1, so a project owned by
// another user is simply absent (a by-id fetch of it is null → a 404, never a 403). A
// Goal can only be added to a Project the same owner owns.

interface ProjectRow {
  id: string;
  title: string;
  description: string;
  status: string;
  area_id: string | null;
  created_at: Date;
}
function mapProject(r: ProjectRow): Project {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status === 'archived' ? 'archived' : 'active',
    areaId: r.area_id,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
const PROJECT_COLS = 'id, title, description, status, area_id, created_at';

/** The owner's projects, newest first, each with its aggregate rollup (goal count +
 *  task-weighted progress across member goals). One grouped query; the rollup reuses
 *  the pure `rollupFromCounts` so it can't disagree with per-goal progress. */
export async function listProjects(owner: string, areaId?: string | null): Promise<ProjectWithRollup[]> {
  const filterArea = areaId && isUuid(areaId) ? areaId : null;
  const rows = await query<
    ProjectRow & { goal_count: string; total: string; done: string; area_name: string | null; area_color: string | null }
  >(`
    SELECT p.id, p.title, p.description, p.status, p.area_id, p.created_at,
           ar.name AS area_name, ar.color AS area_color,
           COUNT(DISTINCT g.id) AS goal_count,
           COUNT(t.id) AS total,
           COUNT(t.id) FILTER (WHERE t.done) AS done
    FROM projects p
    LEFT JOIN goals g ON g.project_id = p.id AND g.owner_id = p.owner_id
    LEFT JOIN tasks t ON t.goal_id = g.id
    LEFT JOIN areas ar ON ar.id = p.area_id
    WHERE p.owner_id = $1${filterArea ? ' AND p.area_id = $2' : ''}
    GROUP BY p.id, ar.name, ar.color
    ORDER BY p.created_at DESC
  `, filterArea ? [owner, filterArea] : [owner]);
  return rows.map((r) => ({
    ...mapProject(r),
    ...rollupFromCounts(Number(r.goal_count), Number(r.done), Number(r.total)),
    areaName: r.area_name,
    areaColor: r.area_color,
  }));
}

export async function createProject(owner: string, title: string, description: string): Promise<ProjectWithRollup> {
  const rows = await query<ProjectRow>(
    `INSERT INTO projects (owner_id, title, description) VALUES ($1, $2, $3) RETURNING ${PROJECT_COLS}`,
    [owner, title, description],
  );
  const project = mapProject(rows[0]);
  await emitAppEvent({ owner, type: 'project.created', subject: project.id, data: { projectTitle: project.title } });
  // C19 · make the new project searchable (title + description). Best-effort.
  await indexBestEffort(indexDoc(projectDoc(owner, project)));
  return { ...project, goalCount: 0, totalTasks: 0, doneTasks: 0, progress: 0 };
}

/** One of the OWNER's projects with its member goals (each with derived progress) and the
 *  rollup across them, or null if the id is unknown OR owned by another user (→ 404). */
export async function getProject(owner: string, id: string): Promise<ProjectWithGoals | null> {
  if (!isUuid(id)) return null;
  // LEFT JOIN the area (A2) so the detail can show its Area chip/picker in one round-trip.
  const projectRows = await query<ProjectRow & { area_name: string | null; area_color: string | null }>(
    `SELECT p.id, p.title, p.description, p.status, p.area_id, p.created_at,
            ar.name AS area_name, ar.color AS area_color
     FROM projects p
     LEFT JOIN areas ar ON ar.id = p.area_id
     WHERE p.id = $1 AND p.owner_id = $2`,
    [id, owner],
  );
  if (projectRows.length === 0) return null;
  // Member goals with their own progress + area chip — same derivation as listGoals, filtered
  // to this project (and owner). The aggregate is rolled up from these via the pure fn.
  const goalRows = await query<
    GoalRow & { total: string; done: string; area_name: string | null; area_color: string | null }
  >(`
    SELECT g.id, g.title, g.description, g.status, g.project_id, g.area_id, g.created_at,
           ar.name AS area_name, ar.color AS area_color,
           COUNT(t.id) AS total,
           COUNT(t.id) FILTER (WHERE t.done) AS done
    FROM goals g
    LEFT JOIN tasks t ON t.goal_id = g.id
    LEFT JOIN areas ar ON ar.id = g.area_id
    WHERE g.project_id = $1 AND g.owner_id = $2
    GROUP BY g.id, ar.name, ar.color
    ORDER BY g.created_at DESC
  `, [id, owner]);
  const goals: GoalWithProgress[] = goalRows.map((r) => {
    const total = Number(r.total);
    const done = Number(r.done);
    return {
      ...mapGoal(r),
      total,
      done,
      progress: progressPercent(done, total),
      areaName: r.area_name,
      areaColor: r.area_color,
    };
  });
  return {
    ...mapProject(projectRows[0]),
    ...rollupProgress(goals),
    goals,
    areaName: projectRows[0].area_name,
    areaColor: projectRows[0].area_color,
  };
}

/** Edit a project's title/description (owner-scoped). Returns the updated project, or
 *  null if the id is unknown or not the owner's. */
export async function updateProject(
  owner: string,
  id: string,
  fields: { title: string; description?: string },
): Promise<Project | null> {
  if (!isUuid(id)) return null;
  const rows = await query<ProjectRow>(
    `UPDATE projects SET title = $2, description = COALESCE($3, description)
     WHERE id = $1 AND owner_id = $4 RETURNING ${PROJECT_COLS}`,
    [id, fields.title, fields.description ?? null, owner],
  );
  if (rows.length === 0) return null;
  const project = mapProject(rows[0]);
  // C19 · the searchable text (title/description) just changed — re-index (idempotent upsert).
  await indexBestEffort(indexDoc(projectDoc(owner, project)));
  return project;
}

/**
 * Set a project's status (active/archived), owner-scoped. Returns the updated project,
 * or null if the id is unknown or not the owner's.
 *
 * Archiving a Project NEVER deletes its Goals — it explicitly nulls goals.project_id so
 * the Goals survive unaffiliated (the same detach the ON DELETE SET NULL FK does for a
 * hard delete). Emits `project.archived` on the transition into archived.
 */
export async function setProjectStatus(owner: string, id: string, status: ProjectStatus): Promise<Project | null> {
  if (!isUuid(id)) return null;
  const rows = await query<ProjectRow & { from_status: string }>(
    `WITH before AS (SELECT id, status AS from_status FROM projects WHERE id = $1 AND owner_id = $3)
     UPDATE projects p SET status = $2 FROM before
     WHERE p.id = before.id
     RETURNING p.id, p.title, p.description, p.status, p.area_id, p.created_at, before.from_status`,
    [id, status, owner],
  );
  if (rows.length === 0) return null;
  const project = mapProject(rows[0]);
  if (status === 'archived') {
    // Detach member goals: null the FK so archiving/deleting a project leaves its goals intact.
    await query(`UPDATE goals SET project_id = NULL WHERE project_id = $1 AND owner_id = $2`, [id, owner]);
    if (rows[0].from_status !== 'archived') {
      await emitAppEvent({ owner, type: 'project.archived', subject: project.id, data: { projectTitle: project.title } });
    }
  }
  return project;
}

/** The owner's goals not yet in any Project — the candidates the picker offers to add.
 *  Owner-scoped; newest first; id + title only. */
export async function listAddableGoals(owner: string): Promise<Array<{ id: string; title: string }>> {
  const rows = await query<{ id: string; title: string }>(
    `SELECT id, title FROM goals WHERE owner_id = $1 AND project_id IS NULL ORDER BY created_at DESC`,
    [owner],
  );
  return rows.map((r) => ({ id: r.id, title: r.title }));
}

/**
 * Add one of the OWNER's goals to one of the OWNER's projects (sets goals.project_id).
 * A Goal belongs to ≤1 Project, so this overwrites any prior membership. Returns the
 * updated goal, or null if EITHER the project or the goal is unknown or not the owner's.
 * Emits `goal.added_to_project` (subject = projectId).
 */
export async function addGoalToProject(owner: string, projectId: string, goalId: string): Promise<Goal | null> {
  if (!isUuid(projectId) || !isUuid(goalId)) return null;
  // The project must exist and be the owner's (a goal can only join a project they own).
  const proj = await query<{ id: string; title: string }>(
    `SELECT id, title FROM projects WHERE id = $1 AND owner_id = $2`,
    [projectId, owner],
  );
  if (proj.length === 0) return null;
  const rows = await query<GoalRow>(
    `UPDATE goals SET project_id = $1 WHERE id = $2 AND owner_id = $3 RETURNING ${GOAL_COLS}`,
    [projectId, goalId, owner],
  );
  if (rows.length === 0) return null;
  const goal = mapGoal(rows[0]);
  await emitAppEvent({
    owner,
    type: 'goal.added_to_project',
    subject: projectId,
    data: { goalTitle: goal.title, projectTitle: proj[0].title },
  });
  return goal;
}

/** Remove a goal from a project (nulls goals.project_id) — owner-scoped and only if the
 *  goal is actually in THIS project. False if unknown, malformed, or not the owner's. */
export async function removeGoalFromProject(owner: string, projectId: string, goalId: string): Promise<boolean> {
  if (!isUuid(projectId) || !isUuid(goalId)) return false;
  const rows = await query<{ id: string }>(
    `UPDATE goals SET project_id = NULL
     WHERE id = $1 AND project_id = $2 AND owner_id = $3 RETURNING id`,
    [goalId, projectId, owner],
  );
  return rows.length > 0;
}

// ---- areas (A2 · life domains; Goals/Habits/Projects tag to ≤1 Area each) ----
// Owner-scoped identically to projects/goals/habits: every area row carries owner_id = the
// session userId, and EVERY query filters WHERE owner_id = $1, so an area owned by another
// user is simply absent (a by-id fetch of it is null → a 404, never a 403). You can only tag
// a resource to an Area you own, and only tag resources you own. Deleting an Area NEVER
// deletes the resources tagged to it — the ON DELETE SET NULL FK nulls their area_id and they
// survive untagged.

interface AreaRow {
  id: string;
  name: string;
  color: string;
  created_at: Date;
}
function mapArea(r: AreaRow): Area {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
const AREA_COLS = 'id, name, color, created_at';

/** The owner's areas, newest first, each with how many of the owner's Goals/Habits/Projects
 *  are tagged to it. One grouped query; COUNT(DISTINCT …) so the three LEFT JOINs don't
 *  multiply the counts. */
export async function listAreas(owner: string): Promise<AreaWithCounts[]> {
  const rows = await query<AreaRow & { goal_count: string; habit_count: string; project_count: string }>(`
    SELECT a.id, a.name, a.color, a.created_at,
           COUNT(DISTINCT g.id) AS goal_count,
           COUNT(DISTINCT h.id) AS habit_count,
           COUNT(DISTINCT pr.id) AS project_count
    FROM areas a
    LEFT JOIN goals g ON g.area_id = a.id AND g.owner_id = a.owner_id
    LEFT JOIN habits h ON h.area_id = a.id AND h.owner_id = a.owner_id
    LEFT JOIN projects pr ON pr.area_id = a.id AND pr.owner_id = a.owner_id
    WHERE a.owner_id = $1
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `, [owner]);
  return rows.map((r) => ({
    ...mapArea(r),
    goalCount: Number(r.goal_count),
    habitCount: Number(r.habit_count),
    projectCount: Number(r.project_count),
  }));
}

/** The owner's areas as lightweight options (id + name + color) for a tagging picker / the
 *  Area filter control. Newest first — no counts, no joins. */
export async function listAreaOptions(owner: string): Promise<AreaOption[]> {
  const rows = await query<{ id: string; name: string; color: string }>(
    `SELECT id, name, color FROM areas WHERE owner_id = $1 ORDER BY created_at DESC`,
    [owner],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color }));
}

export async function createArea(owner: string, name: string, color: string): Promise<AreaWithCounts> {
  const rows = await query<AreaRow>(
    `INSERT INTO areas (owner_id, name, color) VALUES ($1, $2, $3) RETURNING ${AREA_COLS}`,
    [owner, name, color],
  );
  const area = mapArea(rows[0]);
  await emitAppEvent({ owner, type: 'area.created', subject: area.id, data: { areaName: area.name } });
  // C19 · make the new area searchable (indexed by its name → the doc title). Best-effort.
  await indexBestEffort(indexDoc(areaDoc(owner, area)));
  return { ...area, goalCount: 0, habitCount: 0, projectCount: 0 };
}

/** One of the OWNER's areas, or null if the id is unknown OR owned by another user (→ 404). */
export async function getArea(owner: string, id: string): Promise<Area | null> {
  if (!isUuid(id)) return null;
  const rows = await query<AreaRow>(
    `SELECT ${AREA_COLS} FROM areas WHERE id = $1 AND owner_id = $2`,
    [id, owner],
  );
  return rows.length ? mapArea(rows[0]) : null;
}

/** Rename an area and/or set its accent color (owner-scoped). Returns the updated area, or
 *  null if the id is unknown or not the owner's. */
export async function updateArea(
  owner: string,
  id: string,
  fields: { name: string; color?: string },
): Promise<Area | null> {
  if (!isUuid(id)) return null;
  const rows = await query<AreaRow>(
    `UPDATE areas SET name = $2, color = COALESCE($3, color)
     WHERE id = $1 AND owner_id = $4 RETURNING ${AREA_COLS}`,
    [id, fields.name, fields.color ?? null, owner],
  );
  if (rows.length === 0) return null;
  const area = mapArea(rows[0]);
  // C19 · the searchable text (the area name) may have changed — re-index (idempotent upsert).
  await indexBestEffort(indexDoc(areaDoc(owner, area)));
  return area;
}

/**
 * Delete one of the OWNER's areas. The ON DELETE SET NULL FK nulls area_id on every Goal /
 * Habit / Project tagged to it, so those resources SURVIVE untagged — deleting an Area never
 * deletes the things filed under it. False if the id is unknown, malformed, or not the owner's.
 */
export async function deleteArea(owner: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await query<{ id: string }>(
    `DELETE FROM areas WHERE id = $1 AND owner_id = $2 RETURNING id`,
    [id, owner],
  );
  if (rows.length === 0) return false;
  // C19 · the area is gone — drop it from the index so it stops surfacing in search. Best-effort.
  await indexBestEffort(deleteDoc({ owner, type: 'area', id }));
  return true;
}

/** The name of the owner's area, or null if it isn't theirs — the guard that stops tagging a
 *  resource to an Area you don't own. */
async function ownedAreaName(owner: string, areaId: string): Promise<string | null> {
  if (!isUuid(areaId)) return null;
  const rows = await query<{ name: string }>(
    `SELECT name FROM areas WHERE id = $1 AND owner_id = $2`,
    [areaId, owner],
  );
  return rows.length ? rows[0].name : null;
}

/**
 * Set or clear (areaId = null) the Area on one of the OWNER's Goals. Returns the updated goal,
 * or null if the goal is unknown / not the owner's, or the target Area is unknown / not theirs
 * (you can only tag a resource you own to an Area you own). Emits `resource.tagged` when set.
 */
export async function setGoalArea(owner: string, goalId: string, areaId: string | null): Promise<Goal | null> {
  if (!isUuid(goalId)) return null;
  let areaName: string | null = null;
  if (areaId !== null) {
    areaName = await ownedAreaName(owner, areaId);
    if (areaName === null) return null; // unknown / foreign area — refuse
  }
  const rows = await query<GoalRow>(
    `UPDATE goals SET area_id = $1 WHERE id = $2 AND owner_id = $3 RETURNING ${GOAL_COLS}`,
    [areaId, goalId, owner],
  );
  if (rows.length === 0) return null;
  const goal = mapGoal(rows[0]);
  if (areaId !== null && areaName !== null) {
    await emitAppEvent({
      owner,
      type: 'resource.tagged',
      subject: areaId,
      data: { areaName, resourceKind: 'goal' as TaggableKind, resourceTitle: goal.title },
    });
  }
  return goal;
}

/** Set or clear the Area on one of the OWNER's Habits (same contract + guards as setGoalArea). */
export async function setHabitArea(owner: string, habitId: string, areaId: string | null): Promise<Habit | null> {
  if (!isUuid(habitId)) return null;
  let areaName: string | null = null;
  if (areaId !== null) {
    areaName = await ownedAreaName(owner, areaId);
    if (areaName === null) return null;
  }
  const rows = await query<HabitRow>(
    `UPDATE habits SET area_id = $1 WHERE id = $2 AND owner_id = $3
     RETURNING id, title, cadence, area_id, created_at`,
    [areaId, habitId, owner],
  );
  if (rows.length === 0) return null;
  const habit = mapHabit(rows[0]);
  if (areaId !== null && areaName !== null) {
    await emitAppEvent({
      owner,
      type: 'resource.tagged',
      subject: areaId,
      data: { areaName, resourceKind: 'habit' as TaggableKind, resourceTitle: habit.title },
    });
  }
  return habit;
}

/** Set or clear the Area on one of the OWNER's Projects (same contract + guards as setGoalArea). */
export async function setProjectArea(owner: string, projectId: string, areaId: string | null): Promise<Project | null> {
  if (!isUuid(projectId)) return null;
  let areaName: string | null = null;
  if (areaId !== null) {
    areaName = await ownedAreaName(owner, areaId);
    if (areaName === null) return null;
  }
  const rows = await query<ProjectRow>(
    `UPDATE projects SET area_id = $1 WHERE id = $2 AND owner_id = $3 RETURNING ${PROJECT_COLS}`,
    [areaId, projectId, owner],
  );
  if (rows.length === 0) return null;
  const project = mapProject(rows[0]);
  if (areaId !== null && areaName !== null) {
    await emitAppEvent({
      owner,
      type: 'resource.tagged',
      subject: areaId,
      data: { areaName, resourceKind: 'project' as TaggableKind, resourceTitle: project.title },
    });
  }
  return project;
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
  /** The Area (life domain) this Habit is tagged to (A2), or null. Tagged to ≤1 Area; the
   *  FK is nulled (never cascade-deleted) when its Area is deleted. */
  areaId: string | null;
  createdAt: string;
}

/** A habit with its derived streak info for "now". The Area name/color (A2) ride along on
 *  list rows that LEFT JOIN areas, for the card chip; optional (not every constructor joins). */
export interface HabitWithStreak extends Habit, StreakInfo {
  areaName?: string | null;
  areaColor?: string | null;
}

interface HabitRow {
  id: string;
  title: string;
  cadence: string;
  area_id: string | null;
  created_at: Date;
}
function mapHabit(r: HabitRow): Habit {
  return {
    id: r.id,
    title: r.title,
    cadence: r.cadence === 'weekly' ? 'weekly' : 'daily',
    areaId: r.area_id,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function createHabit(owner: string, title: string, cadence: Cadence): Promise<Habit> {
  const rows = await query<HabitRow>(
    `INSERT INTO habits (owner_id, title, cadence) VALUES ($1, $2, $3) RETURNING id, title, cadence, area_id, created_at`,
    [owner, title, cadence],
  );
  const habit = mapHabit(rows[0]);
  // C19 · make the new habit searchable (title). Best-effort.
  await indexBestEffort(indexDoc(habitDoc(owner, habit)));
  return habit;
}

/** The owner's habits, oldest first, each with its streak derived from check-ins as of `now`.
 *  Optionally filtered to one Area (A2) — owner-scoped, so a foreign or malformed area id
 *  simply matches nothing. Each row carries its Area's name/color (LEFT JOIN) for the chip. */
export async function listHabits(owner: string, now: Date, areaId?: string | null): Promise<HabitWithStreak[]> {
  const filterArea = areaId && isUuid(areaId) ? areaId : null;
  const habitRows = await query<HabitRow & { area_name: string | null; area_color: string | null }>(
    `SELECT h.id, h.title, h.cadence, h.area_id, h.created_at, ar.name AS area_name, ar.color AS area_color
     FROM habits h
     LEFT JOIN areas ar ON ar.id = h.area_id
     WHERE h.owner_id = $1${filterArea ? ' AND h.area_id = $2' : ''}
     ORDER BY h.created_at ASC`,
    filterArea ? [owner, filterArea] : [owner],
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
    return {
      ...habit,
      ...computeStreak(byHabit.get(row.id) ?? [], habit.cadence, nowISO),
      areaName: row.area_name,
      areaColor: row.area_color,
    };
  });
}

async function getHabitRow(owner: string, id: string): Promise<Habit | null> {
  if (!isUuid(id)) return null;
  const rows = await query<HabitRow>(
    `SELECT id, title, cadence, area_id, created_at FROM habits WHERE id = $1 AND owner_id = $2`,
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
  if (rows.length === 0) return false;
  // C19 · the habit is gone — drop it from the index so it stops surfacing in search. Best-effort.
  await indexBestEffort(deleteDoc({ owner, type: 'habit', id }));
  return true;
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
    `SELECT id, owner_id, title, cadence, area_id, created_at FROM habits ORDER BY created_at ASC`,
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

// ---- C19 backfill — collect the owner's existing rows as index documents ----------------
// Powers the "reindex my data" action: gather EVERY one of the caller's goals, tasks, projects,
// areas, and habits (owner-scoped — a cross-owner row is simply absent) and shape them into
// index documents, so rows that predate live indexing become searchable too. Read-only; the
// route hands the result to reindexDocs() (capability C19) for a bulk upsert.
export async function collectSearchDocs(owner: string): Promise<IndexDoc[]> {
  const [goals, tasks, projects, areas, habits] = await Promise.all([
    query<GoalRow>(`SELECT ${GOAL_COLS} FROM goals WHERE owner_id = $1`, [owner]),
    query<TaskRow>(`SELECT ${TASK_COLS} FROM tasks WHERE owner_id = $1`, [owner]),
    query<ProjectRow>(`SELECT ${PROJECT_COLS} FROM projects WHERE owner_id = $1`, [owner]),
    query<AreaRow>(`SELECT ${AREA_COLS} FROM areas WHERE owner_id = $1`, [owner]),
    query<HabitRow>(`SELECT id, title, cadence, area_id, created_at FROM habits WHERE owner_id = $1`, [owner]),
  ]);
  return [
    ...goals.map((r) => goalDoc(owner, mapGoal(r))),
    ...tasks.map((r) => taskDoc(owner, mapTask(r))),
    ...projects.map((r) => projectDoc(owner, mapProject(r))),
    ...areas.map((r) => areaDoc(owner, mapArea(r))),
    ...habits.map((r) => habitDoc(owner, mapHabit(r))),
  ];
}
