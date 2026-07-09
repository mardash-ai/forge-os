import { describe, it, expect } from 'vitest';
import {
  PROJECT_STATUSES,
  isProjectStatus,
  rollupFromCounts,
  rollupProgress,
} from '../lib/projects';

describe('isProjectStatus', () => {
  it('accepts the two valid statuses', () => {
    for (const s of PROJECT_STATUSES) {
      expect(isProjectStatus(s)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isProjectStatus('achieved')).toBe(false); // a goal status, not a project one
    expect(isProjectStatus('active ')).toBe(false);
    expect(isProjectStatus('')).toBe(false);
    expect(isProjectStatus(undefined)).toBe(false);
    expect(isProjectStatus(2)).toBe(false);
  });
});

describe('rollupProgress', () => {
  it('is empty (0%) for a project with no goals', () => {
    expect(rollupProgress([])).toEqual({ goalCount: 0, totalTasks: 0, doneTasks: 0, progress: 0 });
  });

  it('task-weights progress across member goals', () => {
    // 2/4 + 2/2 = 4 done of 6 total → 67% (task-weighted, not the 75% mean of 50%+100%).
    const roll = rollupProgress([
      { total: 4, done: 2 },
      { total: 2, done: 2 },
    ]);
    expect(roll).toEqual({ goalCount: 2, totalTasks: 6, doneTasks: 4, progress: 67 });
  });

  it('is 100 when every member task is done', () => {
    expect(rollupProgress([{ total: 3, done: 3 }, { total: 5, done: 5 }]).progress).toBe(100);
  });

  it('treats goals with no tasks as contributing nothing (no divide-by-zero)', () => {
    // Only the one goal with tasks moves the needle; the two empty goals still count.
    const roll = rollupProgress([
      { total: 0, done: 0 },
      { total: 4, done: 1 },
      { total: 0, done: 0 },
    ]);
    expect(roll).toEqual({ goalCount: 3, totalTasks: 4, doneTasks: 1, progress: 25 });
  });

  it('is 0% when all member goals are task-less', () => {
    const roll = rollupProgress([{ total: 0, done: 0 }, { total: 0, done: 0 }]);
    expect(roll).toEqual({ goalCount: 2, totalTasks: 0, doneTasks: 0, progress: 0 });
  });
});

describe('rollupFromCounts', () => {
  it('matches rollupProgress for the same underlying counts', () => {
    expect(rollupFromCounts(2, 4, 6)).toEqual(
      rollupProgress([{ total: 4, done: 2 }, { total: 2, done: 2 }]),
    );
  });

  it('is 0% with no tasks regardless of goal count', () => {
    expect(rollupFromCounts(3, 0, 0)).toEqual({ goalCount: 3, totalTasks: 0, doneTasks: 0, progress: 0 });
  });
});
