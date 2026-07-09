// Pure domain logic for Goals and Tasks — no I/O, so it is unit-testable in Node.
// The data-access layer (lib/db.ts) and API routes are thin wrappers over this.

export type GoalStatus = 'active' | 'achieved' | 'archived';

export const GOAL_STATUSES: readonly GoalStatus[] = ['active', 'achieved', 'archived'];

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  /** The Project this Goal belongs to (A1), or null. A Goal belongs to ≤1 Project;
   *  the FK is nulled (never cascade-deleted) when its Project is archived/deleted. */
  projectId: string | null;
  /** The Area (life domain) this Goal is tagged to (A2), or null. A Goal is tagged to
   *  ≤1 Area; the FK is nulled (never cascade-deleted) when its Area is deleted. */
  areaId: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  goalId: string;
  title: string;
  done: boolean;
  dueDate: string | null; // calendar date "YYYY-MM-DD", or null
  createdAt: string;
}

/** A goal plus its derived progress (never stored — always computed from tasks). The Area
 *  name/color (A2) ride along on list rows that LEFT JOIN areas, for the card chip; they are
 *  optional because not every constructor of this shape joins the area. */
export interface GoalWithProgress extends Goal {
  total: number;
  done: number;
  progress: number; // integer 0–100
  areaName?: string | null;
  areaColor?: string | null;
}

export interface GoalWithTasks extends GoalWithProgress {
  tasks: Task[];
  /** Title of the Project this Goal belongs to (A1), or null — for the detail chip.
   *  Present only on a by-id fetch (getGoal), which joins the project. */
  projectTitle: string | null;
}

/** Narrows an unknown value to a valid GoalStatus. */
export function isGoalStatus(value: unknown): value is GoalStatus {
  return typeof value === 'string' && (GOAL_STATUSES as readonly string[]).includes(value);
}

/** Trims a title candidate; non-strings become ''. */
export function normalizeTitle(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Validates a title: trims it, and rejects empty / whitespace-only input. */
export function validateTitle(raw: unknown): { ok: true; value: string } | { ok: false; value: '' } {
  const value = normalizeTitle(raw);
  return value.length === 0 ? { ok: false, value: '' } : { ok: true, value };
}

/** Percent complete from raw counts. 0 tasks → 0 (no divide-by-zero). */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  const clampedDone = Math.max(0, Math.min(done, total));
  return Math.round((clampedDone / total) * 100);
}

/** Percent complete for a list of tasks. */
export function computeProgress(tasks: ReadonlyArray<{ done: boolean }>): number {
  const done = tasks.reduce((n, t) => (t.done ? n + 1 : n), 0);
  return progressPercent(done, tasks.length);
}
