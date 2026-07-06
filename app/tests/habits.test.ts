import { describe, it, expect } from 'vitest';
import {
  computeStreak,
  endedPeriod,
  finalizeStreak,
  isCadence,
  periodStart,
  previousPeriodStart,
  streakTier,
  unitLabel,
} from '../lib/habits';

const weekday = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Sun … 1=Mon

describe('isCadence', () => {
  it('accepts daily/weekly and rejects everything else', () => {
    expect(isCadence('daily')).toBe(true);
    expect(isCadence('weekly')).toBe(true);
    expect(isCadence('monthly')).toBe(false);
    expect(isCadence('')).toBe(false);
    expect(isCadence(7)).toBe(false);
    expect(isCadence(null)).toBe(false);
  });
});

describe('periodStart', () => {
  it('daily period is the date itself', () => {
    expect(periodStart('2026-07-06', 'daily')).toBe('2026-07-06');
  });

  it('weekly period is that ISO week’s Monday, and is idempotent', () => {
    const ps = periodStart('2026-07-08', 'weekly'); // some mid-week day
    expect(weekday(ps)).toBe(1); // Monday
    expect(periodStart(ps, 'weekly')).toBe(ps);
  });

  it('every day in a week maps to the same Monday', () => {
    const monday = periodStart('2026-07-06', 'weekly');
    for (const d of ['2026-07-06', '2026-07-08', '2026-07-10', '2026-07-12']) {
      expect(periodStart(d, 'weekly')).toBe(monday);
    }
    // the next day rolls to the next week
    expect(periodStart('2026-07-13', 'weekly')).not.toBe(monday);
  });
});

describe('previousPeriodStart', () => {
  it('steps back one day (daily) or seven days (weekly)', () => {
    expect(previousPeriodStart('2026-07-06', 'daily')).toBe('2026-07-05');
    expect(previousPeriodStart('2026-07-01', 'daily')).toBe('2026-06-30'); // month boundary
    const monday = periodStart('2026-07-08', 'weekly');
    expect(previousPeriodStart(monday, 'weekly')).toBe(
      new Date(new Date(`${monday}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10),
    );
  });
});

describe('computeStreak — daily', () => {
  const now = '2026-07-06T12:00:00Z'; // today = 2026-07-06

  it('counts consecutive days ending today when today is done', () => {
    const r = computeStreak(['2026-07-06', '2026-07-05', '2026-07-04'], 'daily', now);
    expect(r).toMatchObject({ streak: 3, doneThisPeriod: true });
  });

  it('keeps the streak alive when today is pending but yesterday is done', () => {
    const r = computeStreak(['2026-07-05', '2026-07-04'], 'daily', now);
    expect(r).toMatchObject({ streak: 2, doneThisPeriod: false });
  });

  it('resets to 0 when a whole period was missed', () => {
    // missed 07-05; today not done → broken
    const r = computeStreak(['2026-07-04', '2026-07-03'], 'daily', now);
    expect(r).toMatchObject({ streak: 0, doneThisPeriod: false });
  });

  it('returns 0 for no check-ins', () => {
    expect(computeStreak([], 'daily', now)).toMatchObject({ streak: 0, longestStreak: 0, doneThisPeriod: false });
  });

  it('tracks the longest run separately from the current streak', () => {
    // current run (07-06,07-05)=2 after a gap at 07-04; earlier run (07-01..07-03)=3
    const r = computeStreak(
      ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-05', '2026-07-06'],
      'daily',
      now,
    );
    expect(r.streak).toBe(2);
    expect(r.doneThisPeriod).toBe(true);
    expect(r.longestStreak).toBe(3);
  });

  it('does not double-count duplicate check-ins for the same period', () => {
    const r = computeStreak(['2026-07-06', '2026-07-06'], 'daily', now);
    expect(r).toMatchObject({ streak: 1, doneThisPeriod: true });
  });
});

describe('computeStreak — weekly', () => {
  const now = '2026-07-08T00:00:00Z';
  const cur = periodStart('2026-07-08', 'weekly');
  const prev = previousPeriodStart(cur, 'weekly');
  const prev2 = previousPeriodStart(prev, 'weekly');

  it('counts consecutive weeks ending this week when this week is done', () => {
    expect(computeStreak([cur, prev], 'weekly', now)).toMatchObject({ streak: 2, doneThisPeriod: true });
  });

  it('keeps the streak when this week is pending but last week is done', () => {
    expect(computeStreak([prev, prev2], 'weekly', now)).toMatchObject({ streak: 2, doneThisPeriod: false });
  });

  it('resets when a week was skipped', () => {
    expect(computeStreak([prev2], 'weekly', now)).toMatchObject({ streak: 0, doneThisPeriod: false });
  });
});

describe('endedPeriod', () => {
  it('daily: the period that just closed is yesterday', () => {
    expect(endedPeriod('2026-07-06T00:05:00Z', 'daily')).toBe('2026-07-05');
  });

  it('weekly: the closed period is last ISO week’s Monday', () => {
    const cur = periodStart('2026-07-08', 'weekly');
    expect(endedPeriod('2026-07-08T00:05:00Z', 'weekly')).toBe(previousPeriodStart(cur, 'weekly'));
  });
});

describe('finalizeStreak — daily', () => {
  const now = '2026-07-06T00:05:00Z'; // just after midnight; closed period = 2026-07-05

  it('reports the closed period as completed when it was checked in (no break)', () => {
    const r = finalizeStreak(['2026-07-05', '2026-07-04'], 'daily', now);
    expect(r).toEqual({ period: '2026-07-05', completed: true, brokenStreak: 0 });
  });

  it('records the broken run length when the closed period was missed', () => {
    // 07-05 missed; 07-04,07-03,07-02 completed → a 3-day run broke
    const r = finalizeStreak(['2026-07-04', '2026-07-03', '2026-07-02'], 'daily', now);
    expect(r).toEqual({ period: '2026-07-05', completed: false, brokenStreak: 3 });
  });

  it('missed with no prior run is not a break (brokenStreak 0)', () => {
    const r = finalizeStreak([], 'daily', now);
    expect(r).toEqual({ period: '2026-07-05', completed: false, brokenStreak: 0 });
  });

  it('a check-in on the still-open current period does not count toward the closed one', () => {
    // only today (07-06) done; the closed period 07-05 is still a miss with no prior run
    const r = finalizeStreak(['2026-07-06'], 'daily', now);
    expect(r).toEqual({ period: '2026-07-05', completed: false, brokenStreak: 0 });
  });
});

describe('finalizeStreak — weekly', () => {
  const now = '2026-07-13T00:05:00Z'; // Monday; closed period = the prior ISO week
  const closed = endedPeriod(now, 'weekly');
  const before1 = previousPeriodStart(closed, 'weekly');
  const before2 = previousPeriodStart(before1, 'weekly');

  it('records a broken run of weeks when the closed week was missed', () => {
    const r = finalizeStreak([before1, before2], 'weekly', now);
    expect(r).toEqual({ period: closed, completed: false, brokenStreak: 2 });
  });

  it('no break when the closed week was completed', () => {
    const r = finalizeStreak([closed, before1], 'weekly', now);
    expect(r).toMatchObject({ period: closed, completed: true, brokenStreak: 0 });
  });
});

describe('streakTier', () => {
  it('climbs the ramp for daily streaks', () => {
    expect(streakTier(0, 'daily')).toBe('cold');
    expect(streakTier(1, 'daily')).toBe('warm');
    expect(streakTier(5, 'daily')).toBe('hot');
    expect(streakTier(10, 'daily')).toBe('bright');
    expect(streakTier(21, 'daily')).toBe('whitehot');
  });

  it('saturates sooner for weekly streaks', () => {
    expect(streakTier(1, 'weekly')).toBe('warm');
    expect(streakTier(3, 'weekly')).toBe('hot');
    expect(streakTier(5, 'weekly')).toBe('bright');
    expect(streakTier(8, 'weekly')).toBe('whitehot');
  });
});

describe('unitLabel', () => {
  it('pluralizes by cadence and count', () => {
    expect(unitLabel('daily', 1)).toBe('day');
    expect(unitLabel('daily', 3)).toBe('days');
    expect(unitLabel('weekly', 1)).toBe('week');
    expect(unitLabel('weekly', 2)).toBe('weeks');
  });
});
