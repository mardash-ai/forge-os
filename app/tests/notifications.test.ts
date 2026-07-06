import { describe, it, expect } from 'vitest';
import {
  activeNotifications,
  buildNotifications,
  daysSince,
  groupByKind,
  type ColdInput,
  type OverdueInput,
} from '../lib/notifications';

const NOW = new Date('2026-07-06T12:00:00');

const OVERDUE: OverdueInput[] = [
  { id: 't1', goalId: 'g1', goalTitle: 'Renovate the kitchen', title: 'Email the contractor', dueDate: '2026-07-04' },
  { id: 't2', goalId: 'g2', goalTitle: 'Ship forge-os v1', title: 'Draft the launch note', dueDate: '2026-07-05' },
  { id: 't3', goalId: 'g1', goalTitle: 'Renovate the kitchen', title: 'Due today', dueDate: '2026-07-06' },
];
const COLD: ColdInput[] = [
  { goalId: 'g3', goalTitle: 'Learn to sail', lastActivity: '2026-06-27T12:00:00' }, // 9 days
  { goalId: 'g4', goalTitle: 'Read 12 books', lastActivity: '2026-06-22T12:00:00' }, // 14 days
];

describe('daysSince', () => {
  it('counts whole elapsed days, never negative', () => {
    expect(daysSince('2026-06-27T12:00:00', NOW)).toBe(9);
    expect(daysSince('2026-07-10T12:00:00', NOW)).toBe(0); // future
  });
});

describe('buildNotifications', () => {
  const notes = buildNotifications(OVERDUE, COLD, NOW);

  it('makes overdue notifications, excluding tasks not actually past due', () => {
    const keys = notes.map((n) => n.key);
    expect(keys).toContain('overdue:t1');
    expect(keys).toContain('overdue:t2');
    expect(keys).not.toContain('overdue:t3'); // due today is not overdue
  });

  it('writes specific, correctly-pluralized messages', () => {
    const t1 = notes.find((n) => n.key === 'overdue:t1')!;
    const t2 = notes.find((n) => n.key === 'overdue:t2')!;
    expect(t1.message).toBe('“Email the contractor” is 2 days overdue');
    expect(t2.message).toBe('“Draft the launch note” is 1 day overdue'); // singular
    expect(notes.find((n) => n.key === 'cold:g3')!.message).toBe(
      '“Learn to sail” has gone cold — no activity in 9 days',
    );
  });

  it('orders overdue-first (most overdue), then cold (coldest first)', () => {
    expect(notes.map((n) => n.key)).toEqual(['overdue:t1', 'overdue:t2', 'cold:g4', 'cold:g3']);
  });

  it('carries goalId/goalTitle and a taskId only for overdue', () => {
    expect(notes.find((n) => n.key === 'overdue:t1')).toMatchObject({ goalId: 'g1', taskId: 't1' });
    expect(notes.find((n) => n.key === 'cold:g3')).toMatchObject({ goalId: 'g3', taskId: null });
  });
});

describe('activeNotifications', () => {
  it('drops dismissed keys', () => {
    const notes = buildNotifications(OVERDUE, COLD, NOW);
    const active = activeNotifications(notes, new Set(['overdue:t1', 'cold:g4']));
    expect(active.map((n) => n.key)).toEqual(['overdue:t2', 'cold:g3']);
  });
});

describe('groupByKind', () => {
  it('splits into Overdue then Gone cold, omitting empties', () => {
    const groups = groupByKind(buildNotifications(OVERDUE, COLD, NOW));
    expect(groups.map((g) => g.label)).toEqual(['Overdue', 'Gone cold']);
    expect(groups[0].notes).toHaveLength(2);
    const overdueOnly = groupByKind(buildNotifications(OVERDUE, [], NOW));
    expect(overdueOnly.map((g) => g.kind)).toEqual(['overdue']);
  });
});
