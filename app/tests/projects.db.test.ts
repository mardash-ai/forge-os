// Data-layer contract tests for A1 · Projects. The `pg` Pool and the C3 event client
// are mocked, so these run in the hermetic offline suite yet still exercise the real
// db.ts query construction: owner-scoping (a cross-owner fetch is null → the route's
// 404), archive nulls goals.project_id (never deletes goals), and project.* events fire.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const calls: { text: string; params: unknown[] }[] = [];
  const state: { handler: (text: string, params: unknown[]) => Row[] } = { handler: () => [] };
  class FakePool {
    query(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      return Promise.resolve({ rows: state.handler(text, params) });
    }
  }
  return { calls, state, FakePool, emitSpy: vi.fn() };
});

vi.mock('pg', () => ({ Pool: hoisted.FakePool }));
vi.mock('../lib/forge-events', () => ({
  emitAppEvent: hoisted.emitSpy,
  latestActivityBySubject: vi.fn(async () => ({})),
}));

import {
  addGoalToProject,
  createProject,
  getProject,
  listAddableGoals,
  listProjects,
  removeGoalFromProject,
  setProjectStatus,
} from '../lib/db';

const OWNER = 'user-A';
const OTHER = 'user-B';
const PID = '11111111-1111-1111-1111-111111111111';
const GID = '22222222-2222-2222-2222-222222222222';

/** Calls that aren't the one-time schema bootstrap DDL. */
function dataCalls() {
  return hoisted.calls.filter((c) => !c.text.includes('CREATE TABLE IF NOT EXISTS projects'));
}
function find(substr: string) {
  return dataCalls().find((c) => c.text.includes(substr));
}

beforeEach(() => {
  hoisted.calls.length = 0;
  hoisted.state.handler = () => [];
  hoisted.emitSpy.mockClear();
});

describe('ensureSchema — projects DDL is additive + idempotent', () => {
  it('creates the projects table + nullable FK, all IF-NOT-EXISTS / ON DELETE SET NULL', async () => {
    // Any db call triggers the memoized bootstrap; grab the DDL it ran.
    await listAddableGoals(OWNER);
    const ddl = hoisted.calls.find((c) => c.text.includes('CREATE TABLE IF NOT EXISTS projects'));
    expect(ddl).toBeDefined();
    expect(ddl!.text).toContain('CREATE TABLE IF NOT EXISTS projects');
    expect(ddl!.text).toContain('CREATE INDEX IF NOT EXISTS projects_owner_id_idx');
    // The FK is nullable + detaches (never cascades) on delete, and is add-column-idempotent.
    expect(ddl!.text).toContain('ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL');
    expect(ddl!.text).toContain('CREATE INDEX IF NOT EXISTS goals_project_id_idx');
  });
});

describe('owner-scoping — every project query filters WHERE owner_id', () => {
  it('listProjects filters to the caller and rolls up per project', async () => {
    hoisted.state.handler = (text) =>
      text.includes('FROM projects p')
        ? [{ id: PID, title: 'P', description: '', status: 'active', created_at: new Date('2026-01-01'), goal_count: '2', total: '6', done: '4' }]
        : [];
    const rows = await listProjects(OWNER);
    const q = find('FROM projects p')!;
    expect(q.text).toContain('p.owner_id = $1');
    expect(q.params).toEqual([OWNER]);
    expect(rows[0]).toMatchObject({ id: PID, goalCount: 2, totalTasks: 6, doneTasks: 4, progress: 67 });
  });

  it('getProject of ANOTHER user’s project is null (→ the route maps it to 404), and never reads its goals', async () => {
    // The owner-scoped project SELECT returns nothing for a non-owner.
    hoisted.state.handler = () => [];
    const result = await getProject(OTHER, PID);
    expect(result).toBeNull();
    const q = find('WHERE p.id = $1 AND p.owner_id = $2')!;
    expect(q.params).toEqual([PID, OTHER]);
    // Existence never leaks: with no project match we must not have queried its member goals.
    expect(find('g.project_id = $1')).toBeUndefined();
  });

  it('getProject of a malformed id short-circuits to null with no query at all', async () => {
    const result = await getProject(OWNER, 'not-a-uuid');
    expect(result).toBeNull();
    expect(dataCalls()).toHaveLength(0);
  });

  it('getProject rolls up progress across the owner’s member goals', async () => {
    hoisted.state.handler = (text) => {
      if (text.includes('WHERE p.id = $1 AND p.owner_id = $2')) {
        return [{ id: PID, title: 'P', description: 'd', status: 'active', created_at: new Date('2026-01-01') }];
      }
      if (text.includes('g.project_id = $1')) {
        return [
          { id: GID, title: 'G1', description: '', status: 'active', project_id: PID, created_at: new Date(), total: '4', done: '2' },
          { id: 'g2', title: 'G2', description: '', status: 'active', project_id: PID, created_at: new Date(), total: '2', done: '2' },
        ];
      }
      return [];
    };
    const p = await getProject(OWNER, PID);
    expect(find('g.project_id = $1')!.params).toEqual([PID, OWNER]);
    expect(p).toMatchObject({ id: PID, goalCount: 2, totalTasks: 6, doneTasks: 4, progress: 67 });
    expect(p!.goals.map((g) => g.id)).toEqual([GID, 'g2']);
  });

  it('listAddableGoals returns only the owner’s unassigned goals', async () => {
    hoisted.state.handler = () => [{ id: GID, title: 'Solo goal' }];
    await listAddableGoals(OWNER);
    const q = find('project_id IS NULL')!;
    expect(q.text).toContain('owner_id = $1');
    expect(q.params).toEqual([OWNER]);
  });
});

describe('archiving a project — nulls goals.project_id, never deletes the goals', () => {
  it('sets status archived, nulls member goals’ FK (owner-scoped), and emits project.archived', async () => {
    hoisted.state.handler = (text) =>
      text.includes('UPDATE projects p SET status')
        ? [{ id: PID, title: 'P', description: '', status: 'archived', created_at: new Date(), from_status: 'active' }]
        : [];
    const result = await setProjectStatus(OWNER, PID, 'archived');
    expect(result).toMatchObject({ id: PID, status: 'archived' });

    const detach = find('UPDATE goals SET project_id = NULL')!;
    expect(detach).toBeDefined();
    expect(detach.text).toContain('WHERE project_id = $1 AND owner_id = $2');
    expect(detach.params).toEqual([PID, OWNER]);

    expect(hoisted.emitSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.emitSpy.mock.calls[0][0]).toMatchObject({
      owner: OWNER,
      type: 'project.archived',
      subject: PID,
    });
  });

  it('archiving ANOTHER user’s project is a no-op null: no goal detach, no event', async () => {
    hoisted.state.handler = () => []; // the owner-scoped status UPDATE matches nothing
    const result = await setProjectStatus(OTHER, PID, 'archived');
    expect(result).toBeNull();
    expect(find('UPDATE goals SET project_id = NULL')).toBeUndefined();
    expect(hoisted.emitSpy).not.toHaveBeenCalled();
  });
});

describe('project.* events (C3) emitted on the mutations that carry them', () => {
  it('createProject emits project.created', async () => {
    hoisted.state.handler = (text) =>
      text.includes('INSERT INTO projects')
        ? [{ id: PID, title: 'New', description: '', status: 'active', created_at: new Date() }]
        : [];
    const p = await createProject(OWNER, 'New', '');
    expect(p).toMatchObject({ id: PID, goalCount: 0, progress: 0 });
    expect(find('INSERT INTO projects')!.params).toEqual([OWNER, 'New', '']);
    expect(hoisted.emitSpy.mock.calls[0][0]).toMatchObject({ owner: OWNER, type: 'project.created', subject: PID });
  });

  it('addGoalToProject requires an owned project + goal, then emits goal.added_to_project', async () => {
    hoisted.state.handler = (text) => {
      if (text.includes('FROM projects WHERE id')) return [{ id: PID, title: 'P' }];
      if (text.includes('UPDATE goals SET project_id = $1')) {
        return [{ id: GID, title: 'G', description: '', status: 'active', project_id: PID, created_at: new Date() }];
      }
      return [];
    };
    const goal = await addGoalToProject(OWNER, PID, GID);
    expect(goal).toMatchObject({ id: GID, projectId: PID });
    expect(find('UPDATE goals SET project_id = $1')!.params).toEqual([PID, GID, OWNER]);
    expect(hoisted.emitSpy.mock.calls[0][0]).toMatchObject({
      owner: OWNER,
      type: 'goal.added_to_project',
      subject: PID,
    });
  });

  it('addGoalToProject to a project you don’t own is null with no goal write, no event', async () => {
    hoisted.state.handler = () => []; // owner-scoped project lookup finds nothing
    const goal = await addGoalToProject(OTHER, PID, GID);
    expect(goal).toBeNull();
    expect(find('UPDATE goals SET project_id = $1')).toBeUndefined();
    expect(hoisted.emitSpy).not.toHaveBeenCalled();
  });

  it('removeGoalFromProject nulls the FK owner-scoped and only within THIS project', async () => {
    hoisted.state.handler = (text) => (text.includes('UPDATE goals SET project_id = NULL') ? [{ id: GID }] : []);
    const ok = await removeGoalFromProject(OWNER, PID, GID);
    expect(ok).toBe(true);
    const q = find('UPDATE goals SET project_id = NULL')!;
    expect(q.text).toContain('WHERE id = $1 AND project_id = $2 AND owner_id = $3');
    expect(q.params).toEqual([GID, PID, OWNER]);
  });

  it('removeGoalFromProject returns false when nothing matched', async () => {
    hoisted.state.handler = () => [];
    expect(await removeGoalFromProject(OWNER, PID, GID)).toBe(false);
  });
});
