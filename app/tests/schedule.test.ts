import { describe, it, expect } from 'vitest';
import {
  bucketFor,
  diffDays,
  groupByBucket,
  isValidDateString,
  relativeDueLabel,
} from '../lib/schedule';

const NOW = new Date('2026-07-06T12:00:00'); // a Monday, local
const WEEKDAY = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/;

describe('isValidDateString', () => {
  it('accepts a real YYYY-MM-DD date', () => {
    expect(isValidDateString('2026-07-06')).toBe(true);
  });
  it('rejects impossible or malformed dates', () => {
    expect(isValidDateString('2026-13-01')).toBe(false); // month 13
    expect(isValidDateString('2026-02-30')).toBe(false); // Feb 30
    expect(isValidDateString('2026-7-6')).toBe(false); // not zero-padded
    expect(isValidDateString('July 6')).toBe(false);
    expect(isValidDateString(null)).toBe(false);
    expect(isValidDateString(20260706)).toBe(false);
  });
});

describe('diffDays', () => {
  it('counts whole calendar days from now', () => {
    expect(diffDays('2026-07-06', NOW)).toBe(0);
    expect(diffDays('2026-07-09', NOW)).toBe(3);
    expect(diffDays('2026-07-04', NOW)).toBe(-2);
  });
});

describe('bucketFor', () => {
  it('splits into overdue / today / week / later', () => {
    expect(bucketFor('2026-07-05', NOW)).toBe('overdue'); // yesterday
    expect(bucketFor('2026-07-06', NOW)).toBe('today'); // today
    expect(bucketFor('2026-07-07', NOW)).toBe('week'); // tomorrow
    expect(bucketFor('2026-07-13', NOW)).toBe('week'); // +7 (boundary, inclusive)
    expect(bucketFor('2026-07-14', NOW)).toBe('later'); // +8
  });
});

describe('relativeDueLabel', () => {
  it('uses friendly relative labels', () => {
    expect(relativeDueLabel('2026-07-06', NOW)).toBe('Today');
    expect(relativeDueLabel('2026-07-07', NOW)).toBe('Tomorrow');
    expect(relativeDueLabel('2026-07-05', NOW)).toBe('Yesterday');
    expect(relativeDueLabel('2026-07-03', NOW)).toBe('3 days ago');
    expect(relativeDueLabel('2026-07-09', NOW)).toMatch(WEEKDAY); // within the week → weekday
    expect(relativeDueLabel('2026-07-20', NOW)).toBe('Jul 20'); // beyond → month day
  });
});

describe('groupByBucket', () => {
  it('orders buckets and sorts most-urgent-first within each; omits empties', () => {
    const tasks = [
      { id: 'a', dueDate: '2026-07-14' }, // later
      { id: 'b', dueDate: '2026-07-05' }, // overdue (yesterday)
      { id: 'c', dueDate: '2026-07-06' }, // today
      { id: 'd', dueDate: '2026-07-03' }, // overdue (older)
      { id: 'e', dueDate: '2026-07-08' }, // this week
    ];
    const groups = groupByBucket(tasks, NOW);
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'week', 'later']);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['d', 'b']); // earliest (most overdue) first
    expect(groups.find((g) => g.key === 'later')!.tasks.map((t) => t.id)).toEqual(['a']);
  });

  it('returns no groups for no dated tasks', () => {
    expect(groupByBucket([], NOW)).toEqual([]);
  });
});
