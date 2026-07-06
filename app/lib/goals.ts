// Pure domain logic for Goals and Tasks — no I/O, so it is unit-testable in Node.
// The data-access layer (lib/db.ts) and API routes are thin wrappers over this.

export type GoalStatus = 'active' | 'achieved' | 'archived';

export const GOAL_STATUSES: readonly GoalStatus[] = ['active', 'achieved', 'archived'];

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
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

/** A goal plus its derived progress (never stored — always computed from tasks). */
export interface GoalWithProgress extends Goal {
  total: number;
  done: number;
  progress: number; // integer 0–100
}

export interface GoalWithTasks extends GoalWithProgress {
  tasks: Task[];
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
