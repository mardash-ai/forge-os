// Pure logic for the Timeline (activity Events). No I/O — directly unit-testable.
// The data-access layer (lib/db.ts) records events; the API and page render them
// through these helpers so they can never disagree.

import type { GoalStatus } from './goals';

export type EventType =
  | 'goal.created'
  | 'goal.status_changed'
  | 'task.added'
  | 'task.completed';

/** Denormalized snapshot stored with each event so the feed renders standalone. */
export interface EventData {
  goalTitle?: string;
  taskTitle?: string;
  from?: GoalStatus;
  to?: GoalStatus;
}

export interface TimelineEvent {
  id: string;
  type: EventType;
  goalId: string | null;
  taskId: string | null;
  data: EventData;
  createdAt: string;
}

// The visual "spark" for an event — drives its heat color in the UI (DESIGN §2).
export type SparkKind = 'forged' | 'completed' | 'reopened' | 'created' | 'added' | 'archived';

const WARM_KINDS: ReadonlySet<SparkKind> = new Set(['forged', 'completed', 'reopened']);

export function sparkKind(event: Pick<TimelineEvent, 'type' | 'data'>): SparkKind {
  switch (event.type) {
    case 'goal.created':
      return 'created';
    case 'task.added':
      return 'added';
    case 'task.completed':
      return 'completed';
    case 'goal.status_changed':
      if (event.data.to === 'achieved') return 'forged';
      if (event.data.to === 'archived') return 'archived';
      return 'reopened';
  }
}

/** A warm event is a productive strike — it glows on the rail. */
export function isWarm(event: Pick<TimelineEvent, 'type' | 'data'>): boolean {
  return WARM_KINDS.has(sparkKind(event));
}

/** Verb-led, active past-tense summary. Same text in the API and the UI. */
export function describeEvent(event: Pick<TimelineEvent, 'type' | 'data'>): string {
  const goal = event.data.goalTitle ?? 'a goal';
  const task = event.data.taskTitle ?? 'a task';
  switch (event.type) {
    case 'goal.created':
      return `Created “${goal}”`;
    case 'task.added':
      return `Added “${task}” to “${goal}”`;
    case 'task.completed':
      return `Completed “${task}”`;
    case 'goal.status_changed':
      if (event.data.to === 'achieved') return `Forged “${goal}”`;
      if (event.data.to === 'archived') return `Archived “${goal}”`;
      return `Reopened “${goal}”`;
  }
}

// ---- day grouping ----

export interface DayGroup {
  key: string; // YYYY-MM-DD
  label: string; // Today | Yesterday | "Wed, Jul 3"
  events: TimelineEvent[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayLabel(d: Date, now: Date): string {
  const key = dayKey(d);
  if (key === dayKey(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKey(yesterday)) return 'Yesterday';
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Group newest-first events into contiguous day buckets. */
export function groupByDay(events: TimelineEvent[], now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const event of events) {
    const d = new Date(event.createdAt);
    const key = dayKey(d);
    if (!current || current.key !== key) {
      current = { key, label: dayLabel(d, now), events: [] };
      groups.push(current);
    }
    current.events.push(event);
  }
  return groups;
}

/** HH:MM (24h) for an event timestamp. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
