import { describe, it, expect } from 'vitest';
import {
  GOAL_STATUSES,
  computeProgress,
  isGoalStatus,
  normalizeTitle,
  progressPercent,
  validateTitle,
} from '../lib/goals';

describe('validateTitle', () => {
  it('trims surrounding whitespace', () => {
    expect(validateTitle('  Ship v1  ')).toEqual({ ok: true, value: 'Ship v1' });
  });

  it('rejects an empty title', () => {
    expect(validateTitle('')).toEqual({ ok: false, value: '' });
  });

  it('rejects a whitespace-only title', () => {
    expect(validateTitle('   ')).toEqual({ ok: false, value: '' });
  });

  it('rejects non-string input', () => {
    expect(validateTitle(undefined).ok).toBe(false);
    expect(validateTitle(42).ok).toBe(false);
    expect(validateTitle(null).ok).toBe(false);
  });
});

describe('normalizeTitle', () => {
  it('trims strings and coerces non-strings to empty', () => {
    expect(normalizeTitle('  hi ')).toBe('hi');
    expect(normalizeTitle(123)).toBe('');
  });
});

describe('progressPercent', () => {
  it('returns 0 when there are no tasks (no divide-by-zero)', () => {
    expect(progressPercent(0, 0)).toBe(0);
  });

  it('rounds to an integer percent', () => {
    expect(progressPercent(1, 4)).toBe(25);
    expect(progressPercent(3, 4)).toBe(75);
    expect(progressPercent(1, 5)).toBe(20);
    expect(progressPercent(3, 8)).toBe(38); // 37.5 rounds up
  });

  it('is 100 when all tasks are done', () => {
    expect(progressPercent(12, 12)).toBe(100);
  });

  it('clamps done above total', () => {
    expect(progressPercent(9, 4)).toBe(100);
  });
});

describe('computeProgress', () => {
  it('is 0 for an empty task list', () => {
    expect(computeProgress([])).toBe(0);
  });

  it('reflects the fraction of done tasks', () => {
    const tasks = [{ done: true }, { done: false }, { done: false }, { done: false }];
    expect(computeProgress(tasks)).toBe(25);
  });
});

describe('isGoalStatus', () => {
  it('accepts the three valid statuses', () => {
    for (const s of GOAL_STATUSES) {
      expect(isGoalStatus(s)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isGoalStatus('done')).toBe(false);
    expect(isGoalStatus('')).toBe(false);
    expect(isGoalStatus(undefined)).toBe(false);
    expect(isGoalStatus(3)).toBe(false);
  });
});
