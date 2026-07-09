// Pure domain logic for Projects — a Project groups related Goals and rolls up
// their progress/heat. No I/O, so it is unit-testable in Node. The data-access
// layer (lib/db.ts) and API routes are thin wrappers over this, and the rollup
// reuses `progressPercent` from lib/goals.ts so the aggregate can never disagree
// with the per-goal progress it's derived from.

import { progressPercent, type GoalWithProgress } from './goals';

export type ProjectStatus = 'active' | 'archived';

export const PROJECT_STATUSES: readonly ProjectStatus[] = ['active', 'archived'];

export interface Project {
  id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  createdAt: string;
}

/** The aggregate derived across a Project's member Goals (never stored). Progress is
 *  task-weighted — sum(done) / sum(total) across members — so it is computed exactly
 *  like a single Goal's progress, one rung up. `heat` is the same 0–100 signal the
 *  Heat Bar renders. */
export interface ProjectRollup {
  goalCount: number;
  totalTasks: number;
  doneTasks: number;
  progress: number; // integer 0–100, task-weighted across member goals
}

/** A Project plus its derived rollup — the shape the list renders. */
export interface ProjectWithRollup extends Project, ProjectRollup {}

/** A Project, its rollup, and its member Goals (each with their own progress) — the
 *  shape the detail view renders. */
export interface ProjectWithGoals extends ProjectWithRollup {
  goals: GoalWithProgress[];
}

/** Narrows an unknown value to a valid ProjectStatus. */
export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);
}

/**
 * The aggregate rollup across a Project's member goals. Task-weighted: a goal with
 * more tasks pulls the aggregate proportionally, exactly as a goal's own progress is
 * done/total of its tasks. Goals with no tasks contribute nothing (no divide-by-zero);
 * a project with no goals (or only empty goals) rolls up to 0%.
 */
export function rollupProgress(
  goals: ReadonlyArray<{ total: number; done: number }>,
): ProjectRollup {
  const totalTasks = goals.reduce((n, g) => n + g.total, 0);
  const doneTasks = goals.reduce((n, g) => n + g.done, 0);
  return {
    goalCount: goals.length,
    totalTasks,
    doneTasks,
    progress: progressPercent(doneTasks, totalTasks),
  };
}

/** Build a rollup straight from aggregate counts (the DB list query already groups
 *  per project). Same task-weighted derivation as `rollupProgress`, via the shared
 *  `progressPercent` primitive. */
export function rollupFromCounts(goalCount: number, doneTasks: number, totalTasks: number): ProjectRollup {
  return { goalCount, totalTasks, doneTasks, progress: progressPercent(doneTasks, totalTasks) };
}
