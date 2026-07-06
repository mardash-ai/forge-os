// Pure logic for Habits — no I/O, so it is unit-testable in Node. The DB layer
// (lib/db.ts) and the /habits page are thin wrappers over this.
//
// NOTE (the C2 stopgap): there is no scheduler, so streaks are DERIVED at read
// time from the check-in history relative to `now`, rather than reset by a job
// at each period boundary. All date math is UTC and date-only ("YYYY-MM-DD"),
// matching how the rest of the app treats calendar dates.

export type Cadence = 'daily' | 'weekly';

export const CADENCES: readonly Cadence[] = ['daily', 'weekly'];

export function isCadence(value: unknown): value is Cadence {
  return typeof value === 'string' && (CADENCES as readonly string[]).includes(value);
}

const DAY_MS = 86_400_000;

function toUTC(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The calendar date (UTC) of an ISO timestamp — the app's notion of "today". */
export function dateOf(nowISO: string): string {
  return new Date(nowISO).toISOString().slice(0, 10);
}

/** The period-start date for a date: the day itself (daily) or that ISO week's Monday (weekly). */
export function periodStart(dateStr: string, cadence: Cadence): string {
  if (cadence === 'daily') return dateStr;
  const ms = toUTC(dateStr);
  const mondayOffset = (new Date(ms).getUTCDay() + 6) % 7; // days since Monday (Mon=0 … Sun=6)
  return fromUTC(ms - mondayOffset * DAY_MS);
}

/** The period-start immediately before a given period-start. */
export function previousPeriodStart(periodStartStr: string, cadence: Cadence): string {
  const stepDays = cadence === 'weekly' ? 7 : 1;
  return fromUTC(toUTC(periodStartStr) - stepDays * DAY_MS);
}

export interface StreakInfo {
  streak: number; // consecutive completed periods ending at the current (or, if pending, previous) period
  longestStreak: number; // best run ever
  doneThisPeriod: boolean; // is the current period checked in?
  currentPeriod: string; // period-start date of "now"
}

/**
 * Derive streak info from completed period-start dates, relative to `now`.
 *
 * Streak counts consecutive completed periods ending at the **current** period if it's done, or
 * the **previous** period if the current one is still pending (today counts as pending, not
 * missed). A gap of a whole period resets the streak to 0.
 */
export function computeStreak(
  completedPeriods: Iterable<string>,
  cadence: Cadence,
  nowISO: string,
): StreakInfo {
  const set = new Set<string>();
  for (const p of completedPeriods) set.add(periodStart(p, cadence)); // normalize defensively

  const currentPeriod = periodStart(dateOf(nowISO), cadence);
  const doneThisPeriod = set.has(currentPeriod);

  // Where does the "current" run end? Current period if done, else the previous if it's done.
  let anchor: string | null = null;
  if (doneThisPeriod) {
    anchor = currentPeriod;
  } else {
    const prev = previousPeriodStart(currentPeriod, cadence);
    if (set.has(prev)) anchor = prev;
  }

  let streak = 0;
  if (anchor) {
    let p = anchor;
    while (set.has(p)) {
      streak++;
      p = previousPeriodStart(p, cadence);
    }
  }

  // Longest run across the whole history.
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const p of Array.from(set).sort()) {
    run = prev !== null && previousPeriodStart(p, cadence) === prev ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
    prev = p;
  }
  longestStreak = Math.max(longestStreak, streak);

  return { streak, longestStreak, doneThisPeriod, currentPeriod };
}

export type HeatTier = 'cold' | 'warm' | 'hot' | 'bright' | 'whitehot';

/** Maps a streak to a heat tier for the ember — saturates sooner for the slower weekly cadence. */
export function streakTier(streak: number, cadence: Cadence): HeatTier {
  if (streak <= 0) return 'cold';
  const weekly = cadence === 'weekly';
  if (streak >= (weekly ? 8 : 21)) return 'whitehot';
  if (streak >= (weekly ? 5 : 10)) return 'bright';
  if (streak >= (weekly ? 3 : 5)) return 'hot';
  return 'warm';
}

/** The pluralized period unit for a count: "day"/"days" or "week"/"weeks". */
export function unitLabel(cadence: Cadence, n: number): string {
  const unit = cadence === 'weekly' ? 'week' : 'day';
  return `${unit}${n === 1 ? '' : 's'}`;
}
