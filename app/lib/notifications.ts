// Pure logic for derived notifications. No I/O — unit-testable. The DB layer
// gathers the raw inputs (overdue tasks, cold goals, dismissed keys) and calls
// these builders; the API and inbox render the result.

import { diffDays } from './schedule';

export const COLD_THRESHOLD_DAYS = 7;

export type NotificationKind = 'overdue' | 'cold-goal';

export interface Notification {
  key: string; // stable: "overdue:<taskId>" | "cold:<goalId>"
  kind: NotificationKind;
  message: string;
  goalId: string;
  goalTitle: string;
  taskId: string | null;
}

/** An incomplete task past its due date. */
export interface OverdueInput {
  id: string;
  goalId: string;
  goalTitle: string;
  title: string;
  dueDate: string;
}

/** An active goal whose last activity is older than the cold threshold. */
export interface ColdInput {
  goalId: string;
  goalTitle: string;
  lastActivity: string; // ISO timestamp
}

/** An active goal plus when it was created — the fallback "last activity" for a goal with no events. */
export interface ActiveGoal {
  goalId: string;
  goalTitle: string;
  createdAt: string; // ISO timestamp
}

/**
 * The active goals gone cold: last activity (latest event, else creation) older than
 * `thresholdDays`, coldest first. Pure — the DB layer supplies the goal list and the
 * per-goal latest-event map (from the C3 event log), replacing the old SQL join.
 */
export function coldGoals(
  goals: ActiveGoal[],
  latestBySubject: Record<string, string>,
  thresholdDays: number,
  now: Date,
): ColdInput[] {
  const cutoff = now.getTime() - thresholdDays * 86_400_000;
  return goals
    .map((g) => ({
      goalId: g.goalId,
      goalTitle: g.goalTitle,
      lastActivity: latestBySubject[g.goalId] ?? g.createdAt,
    }))
    .filter((g) => new Date(g.lastActivity).getTime() < cutoff)
    .sort((a, b) => new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime());
}

function days(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

/** Whole days elapsed since an ISO timestamp (never negative). */
export function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

/** Build the full notification set, most-urgent first: overdue (most overdue
 *  first), then cold goals (coldest first). */
export function buildNotifications(overdue: OverdueInput[], cold: ColdInput[], now: Date): Notification[] {
  const overdueNotes = overdue
    .map((t) => ({ t, n: -diffDays(t.dueDate, now) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map(({ t, n }): Notification => ({
      key: `overdue:${t.id}`,
      kind: 'overdue',
      message: `“${t.title}” is ${days(n)} overdue`,
      goalId: t.goalId,
      goalTitle: t.goalTitle,
      taskId: t.id,
    }));

  const coldNotes = cold
    .map((g) => ({ g, n: daysSince(g.lastActivity, now) }))
    .sort((a, b) => b.n - a.n)
    .map(({ g, n }): Notification => ({
      key: `cold:${g.goalId}`,
      kind: 'cold-goal',
      message: `“${g.goalTitle}” has gone cold — no activity in ${days(n)}`,
      goalId: g.goalId,
      goalTitle: g.goalTitle,
      taskId: null,
    }));

  return [...overdueNotes, ...coldNotes];
}

// (Dismissal is no longer a pure filter here — the platform notifications store owns it,
//  capability C4. See lib/forge-notifications.ts + lib/notification-inbox.ts.)

export interface NotificationGroup {
  kind: NotificationKind;
  label: string;
  notes: Notification[];
}

/** Group for the inbox: Overdue first, then Gone cold. Empty groups omitted. */
export function groupByKind(notes: Notification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const overdue = notes.filter((n) => n.kind === 'overdue');
  const cold = notes.filter((n) => n.kind === 'cold-goal');
  if (overdue.length > 0) groups.push({ kind: 'overdue', label: 'Overdue', notes: overdue });
  if (cold.length > 0) groups.push({ kind: 'cold-goal', label: 'Gone cold', notes: cold });
  return groups;
}
