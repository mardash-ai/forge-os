import { describe, it, expect } from 'vitest';
import { toTimelineEvent, type AppEvent } from '../lib/forge-events';

describe('toTimelineEvent', () => {
  it('maps subject → goalId, data.taskId → taskId, at → createdAt', () => {
    const e: AppEvent = {
      id: 'aevt_1',
      type: 'task.completed',
      subject: 'goal-1',
      data: { taskTitle: 'Ship it', taskId: 'task-9' },
      at: '2026-07-06T12:00:00.000Z',
    };
    expect(toTimelineEvent(e)).toEqual({
      id: 'aevt_1',
      type: 'task.completed',
      goalId: 'goal-1',
      taskId: 'task-9',
      data: { taskTitle: 'Ship it', taskId: 'task-9' },
      createdAt: '2026-07-06T12:00:00.000Z',
    });
  });

  it('tolerates a missing subject and empty data (goalId/taskId → null)', () => {
    const e: AppEvent = { id: 'aevt_2', type: 'goal.created', at: '2026-07-06T00:00:00.000Z' };
    const t = toTimelineEvent(e);
    expect(t.goalId).toBeNull();
    expect(t.taskId).toBeNull();
    expect(t.data).toEqual({});
  });
});
