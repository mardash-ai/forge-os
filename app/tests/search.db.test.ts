// Data-layer tests for C19 index-on-mutation. The `pg` Pool, the C3 event client, and the C19
// search client are all mocked, so these run in the hermetic offline suite yet exercise the real
// db.ts wiring: every domain CREATE/edit upserts the right index document, every hard DELETE
// removes it, indexing is BEST-EFFORT (a failed index never breaks the mutation), and the
// backfill collector is owner-scoped.

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
  return {
    calls,
    state,
    FakePool,
    emitSpy: vi.fn(),
    indexSpy: vi.fn(async (_doc?: unknown) => undefined),
    deleteSpy: vi.fn(async (_input?: unknown) => undefined),
  };
});

vi.mock('pg', () => ({ Pool: hoisted.FakePool }));
vi.mock('../lib/forge-events', () => ({
  emitAppEvent: hoisted.emitSpy,
  latestActivityBySubject: vi.fn(async () => ({})),
}));
vi.mock('../lib/forge-search', () => ({
  indexDoc: hoisted.indexSpy,
  deleteDoc: hoisted.deleteSpy,
}));

import {
  addTask,
  collectSearchDocs,
  createArea,
  createGoal,
  createHabit,
  createProject,
  deleteArea,
  deleteHabit,
  updateArea,
  updateProject,
} from '../lib/db';

const OWNER = 'user-A';
const GID = '22222222-2222-2222-2222-222222222222';
const TID = '33333333-3333-3333-3333-333333333333';
const PID = '11111111-1111-1111-1111-111111111111';
const AID = '44444444-4444-4444-4444-444444444444';
const HID = '55555555-5555-5555-5555-555555555555';
const NID = '66666666-6666-6666-6666-666666666666';

function dataCalls() {
  return hoisted.calls.filter((c) => !c.text.includes('CREATE TABLE IF NOT EXISTS'));
}
function find(substr: string) {
  return dataCalls().find((c) => c.text.includes(substr));
}

beforeEach(() => {
  hoisted.calls.length = 0;
  hoisted.state.handler = () => [];
  hoisted.emitSpy.mockClear();
  hoisted.indexSpy.mockClear();
  hoisted.indexSpy.mockImplementation(async () => undefined);
  hoisted.deleteSpy.mockClear();
  hoisted.deleteSpy.mockImplementation(async () => undefined);
});

describe('index-on-create — every new domain row is made searchable', () => {
  it('createGoal indexes the goal (title + description as body)', async () => {
    hoisted.state.handler = (t) =>
      t.includes('INSERT INTO goals')
        ? [{ id: GID, title: 'Learn welding', description: 'arc + mig', status: 'active', project_id: null, area_id: null, created_at: new Date('2026-01-01') }]
        : [];
    await createGoal(OWNER, 'Learn welding', 'arc + mig');
    expect(hoisted.indexSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.indexSpy.mock.calls[0][0]).toMatchObject({
      owner: OWNER,
      type: 'goal',
      id: GID,
      title: 'Learn welding',
      body: 'arc + mig',
    });
  });

  it('addTask indexes the task with attrs.goalId (so the hit links to its goal page)', async () => {
    hoisted.state.handler = (t) => {
      if (t.includes('FROM goals WHERE id = $1 AND owner_id = $2')) return [{ id: GID, title: 'G' }];
      if (t.includes('INSERT INTO tasks')) return [{ id: TID, goal_id: GID, title: 'Buy rods', done: false, due_date: null, created_at: new Date() }];
      return [];
    };
    await addTask(OWNER, GID, 'Buy rods');
    expect(hoisted.indexSpy.mock.calls[0][0]).toMatchObject({
      owner: OWNER,
      type: 'task',
      id: TID,
      title: 'Buy rods',
      attrs: { goalId: GID },
    });
  });

  it('createProject indexes the project (title + description)', async () => {
    hoisted.state.handler = (t) =>
      t.includes('INSERT INTO projects') ? [{ id: PID, title: 'Shop', description: 'the garage', status: 'active', area_id: null, created_at: new Date() }] : [];
    await createProject(OWNER, 'Shop', 'the garage');
    expect(hoisted.indexSpy.mock.calls[0][0]).toMatchObject({ owner: OWNER, type: 'project', id: PID, title: 'Shop', body: 'the garage' });
  });

  it('createArea indexes the area by its name (→ the doc title)', async () => {
    hoisted.state.handler = (t) =>
      t.includes('INSERT INTO areas') ? [{ id: AID, name: 'Health', color: '#f00', created_at: new Date() }] : [];
    await createArea(OWNER, 'Health', '#f00');
    expect(hoisted.indexSpy.mock.calls[0][0]).toMatchObject({ owner: OWNER, type: 'area', id: AID, title: 'Health' });
  });

  it('createHabit indexes the habit (title)', async () => {
    hoisted.state.handler = (t) =>
      t.includes('INSERT INTO habits') ? [{ id: HID, title: 'Stretch', cadence: 'daily', area_id: null, created_at: new Date() }] : [];
    await createHabit(OWNER, 'Stretch', 'daily');
    expect(hoisted.indexSpy.mock.calls[0][0]).toMatchObject({ owner: OWNER, type: 'habit', id: HID, title: 'Stretch' });
  });
});

describe('re-index on edit — when the searchable text changes', () => {
  it('updateProject re-indexes the edited project', async () => {
    hoisted.state.handler = (t) =>
      t.includes('UPDATE projects SET title') ? [{ id: PID, title: 'Renamed', description: 'new', status: 'active', area_id: null, created_at: new Date() }] : [];
    await updateProject(OWNER, PID, { title: 'Renamed', description: 'new' });
    expect(hoisted.indexSpy.mock.calls[0][0]).toMatchObject({ type: 'project', id: PID, title: 'Renamed', body: 'new' });
  });

  it('updateArea re-indexes the renamed area', async () => {
    hoisted.state.handler = (t) =>
      t.includes('UPDATE areas SET name') ? [{ id: AID, name: 'Fitness', color: '#f00', created_at: new Date() }] : [];
    await updateArea(OWNER, AID, { name: 'Fitness' });
    expect(hoisted.indexSpy.mock.calls[0][0]).toMatchObject({ type: 'area', id: AID, title: 'Fitness' });
  });
});

describe('remove from index — on hard delete', () => {
  it('deleteArea removes the area doc', async () => {
    hoisted.state.handler = (t) => (t.includes('DELETE FROM areas') ? [{ id: AID }] : []);
    await deleteArea(OWNER, AID);
    expect(hoisted.deleteSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.deleteSpy.mock.calls[0][0]).toEqual({ owner: OWNER, type: 'area', id: AID });
  });

  it('deleteHabit removes the habit doc', async () => {
    hoisted.state.handler = (t) => (t.includes('DELETE FROM habits') ? [{ id: HID }] : []);
    await deleteHabit(OWNER, HID);
    expect(hoisted.deleteSpy.mock.calls[0][0]).toEqual({ owner: OWNER, type: 'habit', id: HID });
  });

  it('a no-op delete (nothing matched) does NOT touch the index', async () => {
    hoisted.state.handler = () => [];
    await deleteHabit(OWNER, HID);
    expect(hoisted.deleteSpy).not.toHaveBeenCalled();
  });
});

describe('best-effort — a failed index write never breaks the mutation', () => {
  it('createGoal still returns the goal when indexDoc rejects', async () => {
    hoisted.state.handler = (t) =>
      t.includes('INSERT INTO goals') ? [{ id: GID, title: 'G', description: '', status: 'active', project_id: null, area_id: null, created_at: new Date() }] : [];
    hoisted.indexSpy.mockRejectedValueOnce(new Error('index down'));
    const goal = await createGoal(OWNER, 'G', '');
    expect(goal).toMatchObject({ id: GID, title: 'G' });
  });
});

describe('collectSearchDocs — owner-scoped backfill', () => {
  it('reads ONLY the caller’s rows across all five kinds and stamps each doc with that owner', async () => {
    hoisted.state.handler = (t) => {
      if (t.includes('FROM goals WHERE owner_id = $1')) return [{ id: GID, title: 'G', description: 'd', status: 'active', project_id: null, area_id: null, created_at: new Date() }];
      if (t.includes('FROM tasks WHERE owner_id = $1')) return [{ id: TID, goal_id: GID, title: 'T', done: false, due_date: null, created_at: new Date() }];
      if (t.includes('FROM projects WHERE owner_id = $1')) return [{ id: PID, title: 'P', description: '', status: 'active', area_id: null, created_at: new Date() }];
      if (t.includes('FROM areas WHERE owner_id = $1')) return [{ id: AID, name: 'A', color: '', created_at: new Date() }];
      if (t.includes('FROM habits WHERE owner_id = $1')) return [{ id: HID, title: 'H', cadence: 'daily', area_id: null, created_at: new Date() }];
      if (t.includes('FROM documents WHERE owner_id = $1')) return [{ id: NID, title: 'N', body_md: 'nb', goal_id: null, project_id: null, created_at: new Date(), updated_at: new Date() }];
      return [];
    };
    const docs = await collectSearchDocs(OWNER);

    // Every collector query is owner-scoped to the caller.
    for (const table of ['FROM goals WHERE owner_id = $1', 'FROM tasks WHERE owner_id = $1', 'FROM projects WHERE owner_id = $1', 'FROM areas WHERE owner_id = $1', 'FROM habits WHERE owner_id = $1', 'FROM documents WHERE owner_id = $1']) {
      expect(find(table)!.params).toEqual([OWNER]);
    }

    // One doc per kind, each carrying the caller's owner and its type/id.
    expect(docs).toHaveLength(6);
    expect(docs.every((d) => d.owner === OWNER)).toBe(true);
    expect(docs.map((d) => `${d.type}:${d.id}`)).toEqual([
      `goal:${GID}`,
      `task:${TID}`,
      `project:${PID}`,
      `area:${AID}`,
      `habit:${HID}`,
      `note:${NID}`,
    ]);
  });
});
