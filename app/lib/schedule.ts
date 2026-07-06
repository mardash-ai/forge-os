// Pure logic for due dates and the Today focus view. No I/O — unit-testable.
// Dates are calendar dates ("YYYY-MM-DD", no time-of-day); "today"/"overdue" are
// computed against the caller's `now` in its local calendar day.

export type DueBucket = 'overdue' | 'today' | 'week' | 'later';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for a real calendar date in YYYY-MM-DD form. */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days from `now` to the due date (negative = past). */
export function diffDays(dueDate: string, now: Date): number {
  return Math.round((dayStart(parseDate(dueDate)) - dayStart(now)) / 86_400_000);
}

export function bucketFor(dueDate: string, now: Date): DueBucket {
  const diff = diffDays(dueDate, now);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'week';
  return 'later';
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short, specific relative label: Today / Tomorrow / Yesterday / N days ago / Wed / Jul 15. */
export function relativeDueLabel(dueDate: string, now: Date): string {
  const diff = diffDays(dueDate, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < -1) return `${-diff} days ago`;
  const due = parseDate(dueDate);
  if (diff <= 7) return WEEKDAYS[due.getDay()];
  return `${MONTHS[due.getMonth()]} ${due.getDate()}`;
}

const BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  later: 'Later',
};
const BUCKET_ORDER: readonly DueBucket[] = ['overdue', 'today', 'week', 'later'];

export interface DueGroup<T> {
  key: DueBucket;
  label: string;
  tasks: T[];
}

/** Group dated tasks into urgency buckets (Overdue → Today → This week → Later),
 *  most-urgent first within each. Empty buckets are omitted. */
export function groupByBucket<T extends { dueDate: string }>(tasks: T[], now: Date): DueGroup<T>[] {
  const byKey = new Map<DueBucket, T[]>();
  for (const task of tasks) {
    const key = bucketFor(task.dueDate, now);
    const arr = byKey.get(key);
    if (arr) arr.push(task);
    else byKey.set(key, [task]);
  }
  const groups: DueGroup<T>[] = [];
  for (const key of BUCKET_ORDER) {
    const arr = byKey.get(key);
    if (arr && arr.length > 0) {
      arr.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      groups.push({ key, label: BUCKET_LABELS[key], tasks: arr });
    }
  }
  return groups;
}
