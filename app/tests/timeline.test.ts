import { describe, it, expect } from 'vitest';
import {
  describeEvent,
  eventHref,
  formatTime,
  groupByDay,
  isWarm,
  sparkKind,
  type TimelineEvent,
} from '../lib/timeline';

function ev(partial: Partial<TimelineEvent> & Pick<TimelineEvent, 'type'>): TimelineEvent {
  return {
    id: partial.id ?? 'e1',
    type: partial.type,
    goalId: partial.goalId ?? 'g1',
    taskId: partial.taskId ?? null,
    data: partial.data ?? {},
    createdAt: partial.createdAt ?? new Date('2026-07-05T10:00:00').toISOString(),
  };
}

describe('describeEvent', () => {
  it('renders a verb-led summary per type', () => {
    expect(describeEvent(ev({ type: 'goal.created', data: { goalTitle: 'Learn to sail' } }))).toBe(
      'Created “Learn to sail”',
    );
    expect(
      describeEvent(ev({ type: 'task.added', data: { taskTitle: 'Charter solo', goalTitle: 'Learn to sail' } })),
    ).toBe('Added “Charter solo” to “Learn to sail”');
    expect(describeEvent(ev({ type: 'task.completed', data: { taskTitle: 'Build the API' } }))).toBe(
      'Completed “Build the API”',
    );
  });

  it('distinguishes status transitions', () => {
    const g = { goalTitle: 'Ship forge-os v1' };
    expect(describeEvent(ev({ type: 'goal.status_changed', data: { ...g, to: 'achieved' } }))).toBe('Forged “Ship forge-os v1”');
    expect(describeEvent(ev({ type: 'goal.status_changed', data: { ...g, to: 'archived' } }))).toBe('Archived “Ship forge-os v1”');
    expect(describeEvent(ev({ type: 'goal.status_changed', data: { ...g, to: 'active' } }))).toBe('Reopened “Ship forge-os v1”');
  });
});

describe('sparkKind & isWarm', () => {
  it('maps each event to its spark', () => {
    expect(sparkKind(ev({ type: 'goal.created' }))).toBe('created');
    expect(sparkKind(ev({ type: 'task.added' }))).toBe('added');
    expect(sparkKind(ev({ type: 'task.completed' }))).toBe('completed');
    expect(sparkKind(ev({ type: 'goal.status_changed', data: { to: 'achieved' } }))).toBe('forged');
    expect(sparkKind(ev({ type: 'goal.status_changed', data: { to: 'archived' } }))).toBe('archived');
    expect(sparkKind(ev({ type: 'goal.status_changed', data: { to: 'active' } }))).toBe('reopened');
  });

  it('treats productive strikes as warm', () => {
    expect(isWarm(ev({ type: 'task.completed' }))).toBe(true);
    expect(isWarm(ev({ type: 'goal.status_changed', data: { to: 'achieved' } }))).toBe(true);
    expect(isWarm(ev({ type: 'goal.created' }))).toBe(false);
    expect(isWarm(ev({ type: 'task.added' }))).toBe(false);
    expect(isWarm(ev({ type: 'goal.status_changed', data: { to: 'archived' } }))).toBe(false);
  });
});

describe('project events (A1)', () => {
  it('describes each project.* event verb-led', () => {
    expect(describeEvent(ev({ type: 'project.created', data: { projectTitle: 'Kitchen reno' } }))).toBe(
      'Started “Kitchen reno”',
    );
    expect(
      describeEvent(ev({ type: 'goal.added_to_project', data: { goalTitle: 'Pick tile', projectTitle: 'Kitchen reno' } })),
    ).toBe('Added “Pick tile” to “Kitchen reno”');
    expect(describeEvent(ev({ type: 'project.archived', data: { projectTitle: 'Kitchen reno' } }))).toBe(
      'Archived “Kitchen reno”',
    );
  });

  it('maps project.* events to reused sparks (none of them warm)', () => {
    expect(sparkKind(ev({ type: 'project.created' }))).toBe('created');
    expect(sparkKind(ev({ type: 'goal.added_to_project' }))).toBe('added');
    expect(sparkKind(ev({ type: 'project.archived' }))).toBe('archived');
    expect(isWarm(ev({ type: 'project.created' }))).toBe(false);
    expect(isWarm(ev({ type: 'goal.added_to_project' }))).toBe(false);
    expect(isWarm(ev({ type: 'project.archived' }))).toBe(false);
  });
});

describe('eventHref', () => {
  it('routes project.* events (subject = projectId) to /projects/<id>', () => {
    expect(eventHref(ev({ type: 'project.created', goalId: 'p1' }))).toBe('/projects/p1');
    expect(eventHref(ev({ type: 'goal.added_to_project', goalId: 'p1' }))).toBe('/projects/p1');
    expect(eventHref(ev({ type: 'project.archived', goalId: 'p1' }))).toBe('/projects/p1');
  });

  it('routes goal/task events to /goals/<id> and a subject-less event to the floor', () => {
    expect(eventHref(ev({ type: 'task.completed', goalId: 'g1' }))).toBe('/goals/g1');
    expect(eventHref(ev({ type: 'goal.created', goalId: 'g1' }))).toBe('/goals/g1');
    // Built directly (the ev() helper coalesces a null goalId to 'g1').
    expect(eventHref({ type: 'goal.created', goalId: null })).toBe('/');
  });
});

describe('groupByDay', () => {
  it('buckets newest-first events by day with friendly labels', () => {
    const now = new Date('2026-07-05T12:00:00');
    const events = [
      ev({ id: '1', type: 'task.completed', createdAt: new Date('2026-07-05T14:00:00').toISOString() }),
      ev({ id: '2', type: 'task.completed', createdAt: new Date('2026-07-05T09:00:00').toISOString() }),
      ev({ id: '3', type: 'task.completed', createdAt: new Date('2026-07-04T20:00:00').toISOString() }),
      ev({ id: '4', type: 'goal.created', createdAt: new Date('2026-07-03T08:00:00').toISOString() }),
    ];
    const groups = groupByDay(events, now);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', expect.stringContaining('Jul 3')]);
    expect(groups[0].events.map((e) => e.id)).toEqual(['1', '2']);
    expect(groups[1].events).toHaveLength(1);
  });

  it('returns no groups for no events', () => {
    expect(groupByDay([], new Date('2026-07-05T12:00:00'))).toEqual([]);
  });
});

describe('formatTime', () => {
  it('formats HH:MM in 24h', () => {
    expect(formatTime(new Date('2026-07-05T14:32:00').toISOString())).toBe('14:32');
    expect(formatTime(new Date('2026-07-05T09:05:00').toISOString())).toBe('09:05');
  });
});
