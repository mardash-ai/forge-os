// Data-layer contract tests for A2 · Areas. The `pg` Pool and the C3 event client are
// mocked, so these run in the hermetic offline suite yet still exercise the real db.ts query
// construction: additive+idempotent schema (areas table + the three area_id FKs, ON DELETE SET
// NULL), owner-scoping (a cross-owner fetch is null → the route's 404), that deleting an Area
// leaves the tagged resources (the FK nulls their tag, never cascades), tagging guards + the
// area.*/resource.tagged events, and the owner-scoped Area filter on every list view.

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
  createArea,
  deleteArea,
  getArea,
  listAreas,
  listDueTasks,
  listGoals,
  listHabits,
  listProjects,
  setGoalArea,
  setHabitArea,
  setProjectArea,
} from '../lib/db';

const OWNER = 'user-A';
const OTHER = 'user-B';
const AID = '33333333-3333-3333-3333-333333333333';
const GID = '22222222-2222-2222-2222-222222222222';
const HID = '44444444-4444-4444-4444-444444444444';
const PID = '11111111-1111-1111-1111-111111111111';

/** Calls that aren't the one-time schema bootstrap DDL. */
function dataCalls() {
  return hoisted.calls.filter((c) => !c.text.includes('CREATE TABLE IF NOT EXISTS areas'));
}
function find(substr: string) {
  return dataCalls().find((c) => c.text.includes(substr));
}

beforeEach(() => {
  hoisted.calls.length = 0;
  hoisted.state.handler = () => [];
  hoisted.emitSpy.mockClear();
});

describe('ensureSchema — areas DDL is additive + idempotent', () => {
  it('creates the areas table + the three area_id FKs, all IF-NOT-EXISTS / ON DELETE SET NULL', async () => {
    // Any db call triggers the memoized bootstrap; grab the DDL it ran.
    await listAreas(OWNER);
    const ddl = hoisted.calls.find((c) => c.text.includes('CREATE TABLE IF NOT EXISTS areas'));
    expect(ddl).toBeDefined();
    expect(ddl!.text).toContain('CREATE TABLE IF NOT EXISTS areas');
    expect(ddl!.text).toContain('CREATE INDEX IF NOT EXISTS areas_owner_id_idx');
    // Each of goals / habits / projects gets a nullable area_id that DETACHES (never cascades)
    // on delete, and is add-column-idempotent.
    expect(ddl!.text).toContain('ALTER TABLE goals ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas(id) ON DELETE SET NULL');
    expect(ddl!.text).toContain('ALTER TABLE habits ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas(id) ON DELETE SET NULL');
    expect(ddl!.text).toContain('ALTER TABLE projects ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas(id) ON DELETE SET NULL');
    expect(ddl!.text).toContain('CREATE INDEX IF NOT EXISTS goals_area_id_idx');
    expect(ddl!.text).toContain('CREATE INDEX IF NOT EXISTS habits_area_id_idx');
    expect(ddl!.text).toContain('CREATE INDEX IF NOT EXISTS projects_area_id_idx');
  });
});

describe('owner-scoping — every area query filters WHERE owner_id', () => {
  it('listAreas filters to the caller and rolls up per-kind counts', async () => {
    hoisted.state.handler = (text) =>
      text.includes('FROM areas a')
        ? [{ id: AID, name: 'Health', color: '#cb5320', created_at: new Date('2026-01-01'), goal_count: '3', habit_count: '2', project_count: '1' }]
        : [];
    const rows = await listAreas(OWNER);
    const q = find('FROM areas a')!;
    expect(q.text).toContain('a.owner_id = $1');
    expect(q.params).toEqual([OWNER]);
    expect(rows[0]).toMatchObject({ id: AID, name: 'Health', color: '#cb5320', goalCount: 3, habitCount: 2, projectCount: 1 });
  });

  it('getArea of ANOTHER user’s area is null (→ the route maps it to 404)', async () => {
    hoisted.state.handler = () => [];
    const result = await getArea(OTHER, AID);
    expect(result).toBeNull();
    const q = find('SELECT id, name, color, created_at FROM areas')!;
    expect(q.text).toContain('WHERE id = $1 AND owner_id = $2');
    expect(q.params).toEqual([AID, OTHER]);
  });

  it('getArea of a malformed id short-circuits to null with no query at all', async () => {
    const result = await getArea(OWNER, 'not-a-uuid');
    expect(result).toBeNull();
    expect(dataCalls()).toHaveLength(0);
  });
});

describe('createArea emits area.created (C3)', () => {
  it('inserts owner-scoped and emits area.created with the area name', async () => {
    hoisted.state.handler = (text) =>
      text.includes('INSERT INTO areas')
        ? [{ id: AID, name: 'Career', color: '', created_at: new Date() }]
        : [];
    const a = await createArea(OWNER, 'Career', '');
    expect(a).toMatchObject({ id: AID, name: 'Career', goalCount: 0, habitCount: 0, projectCount: 0 });
    expect(find('INSERT INTO areas')!.params).toEqual([OWNER, 'Career', '']);
    expect(hoisted.emitSpy.mock.calls[0][0]).toMatchObject({
      owner: OWNER,
      type: 'area.created',
      subject: AID,
      data: { areaName: 'Career' },
    });
  });
});

describe('deleting an Area — owner-scoped; the FK nulls tags, never deletes the resources', () => {
  it('deleteArea issues an owner-scoped DELETE (ON DELETE SET NULL detaches the tagged rows)', async () => {
    // The DDL test above proves the area_id FKs are ON DELETE SET NULL, so this single
    // owner-scoped DELETE leaves every tagged goal/habit/project intact but untagged.
    hoisted.state.handler = (text) => (text.includes('DELETE FROM areas') ? [{ id: AID }] : []);
    const ok = await deleteArea(OWNER, AID);
    expect(ok).toBe(true);
    const q = find('DELETE FROM areas')!;
    expect(q.text).toContain('WHERE id = $1 AND owner_id = $2');
    expect(q.params).toEqual([AID, OWNER]);
  });

  it('deleting ANOTHER user’s area matches nothing → false', async () => {
    hoisted.state.handler = () => [];
    expect(await deleteArea(OTHER, AID)).toBe(false);
  });
});

describe('tagging a resource — guarded by area ownership, emits resource.tagged', () => {
  it('setGoalArea requires an area the caller owns, then tags + emits resource.tagged', async () => {
    hoisted.state.handler = (text) => {
      if (text.includes('SELECT name FROM areas')) return [{ name: 'Health' }];
      if (text.includes('UPDATE goals SET area_id = $1')) {
        return [{ id: GID, title: 'Run a 5k', description: '', status: 'active', project_id: null, area_id: AID, created_at: new Date() }];
      }
      return [];
    };
    const goal = await setGoalArea(OWNER, GID, AID);
    expect(goal).toMatchObject({ id: GID, areaId: AID });
    // The ownership guard queried the area owner-scoped, then the update carried [area, goal, owner].
    expect(find('SELECT name FROM areas')!.params).toEqual([AID, OWNER]);
    expect(find('UPDATE goals SET area_id = $1')!.params).toEqual([AID, GID, OWNER]);
    expect(hoisted.emitSpy.mock.calls[0][0]).toMatchObject({
      owner: OWNER,
      type: 'resource.tagged',
      subject: AID,
      data: { areaName: 'Health', resourceKind: 'goal', resourceTitle: 'Run a 5k' },
    });
  });

  it('tagging to an area you don’t own is null — no goal write, no event', async () => {
    hoisted.state.handler = () => []; // the owner-scoped area lookup finds nothing
    const goal = await setGoalArea(OWNER, GID, AID);
    expect(goal).toBeNull();
    expect(find('UPDATE goals SET area_id = $1')).toBeUndefined();
    expect(hoisted.emitSpy).not.toHaveBeenCalled();
  });

  it('clearing (areaId = null) nulls the tag owner-scoped, with NO ownership lookup and NO event', async () => {
    hoisted.state.handler = (text) =>
      text.includes('UPDATE goals SET area_id = $1')
        ? [{ id: GID, title: 'Run a 5k', description: '', status: 'active', project_id: null, area_id: null, created_at: new Date() }]
        : [];
    const goal = await setGoalArea(OWNER, GID, null);
    expect(goal).toMatchObject({ id: GID, areaId: null });
    expect(find('SELECT name FROM areas')).toBeUndefined(); // no guard needed to clear
    expect(find('UPDATE goals SET area_id = $1')!.params).toEqual([null, GID, OWNER]);
    expect(hoisted.emitSpy).not.toHaveBeenCalled();
  });

  it('setHabitArea + setProjectArea tag owner-scoped and emit resource.tagged with the right kind', async () => {
    // Habit
    hoisted.state.handler = (text) => {
      if (text.includes('SELECT name FROM areas')) return [{ name: 'Health' }];
      if (text.includes('UPDATE habits SET area_id = $1')) return [{ id: HID, title: 'Stretch', cadence: 'daily', area_id: AID, created_at: new Date() }];
      return [];
    };
    const habit = await setHabitArea(OWNER, HID, AID);
    expect(habit).toMatchObject({ id: HID, areaId: AID });
    expect(find('UPDATE habits SET area_id = $1')!.params).toEqual([AID, HID, OWNER]);
    expect(hoisted.emitSpy.mock.calls[0][0]).toMatchObject({ type: 'resource.tagged', subject: AID, data: { resourceKind: 'habit' } });

    // Project
    hoisted.calls.length = 0;
    hoisted.emitSpy.mockClear();
    hoisted.state.handler = (text) => {
      if (text.includes('SELECT name FROM areas')) return [{ name: 'Health' }];
      if (text.includes('UPDATE projects SET area_id = $1')) return [{ id: PID, title: 'Marathon', description: '', status: 'active', area_id: AID, created_at: new Date() }];
      return [];
    };
    const project = await setProjectArea(OWNER, PID, AID);
    expect(project).toMatchObject({ id: PID, areaId: AID });
    expect(find('UPDATE projects SET area_id = $1')!.params).toEqual([AID, PID, OWNER]);
    expect(hoisted.emitSpy.mock.calls[0][0]).toMatchObject({ type: 'resource.tagged', subject: AID, data: { resourceKind: 'project' } });
  });
});

describe('the Area filter — owner-scoped AND <resource>.area_id = $2 on every list view', () => {
  it('listGoals filters to the area only when a valid area id is given', async () => {
    await listGoals(OWNER, AID);
    const q = find('FROM goals g')!;
    expect(q.text).toContain('AND g.area_id = $2');
    expect(q.params).toEqual([OWNER, AID]);
  });

  it('listGoals with no area filter carries just the owner', async () => {
    await listGoals(OWNER);
    const q = find('FROM goals g')!;
    expect(q.text).not.toContain('g.area_id = $2');
    expect(q.params).toEqual([OWNER]);
  });

  it('a malformed area filter is ignored (no injection, no error) — owner only', async () => {
    await listGoals(OWNER, 'not-a-uuid');
    const q = find('FROM goals g')!;
    expect(q.text).not.toContain('g.area_id = $2');
    expect(q.params).toEqual([OWNER]);
  });

  it('listHabits filters to the area owner-scoped', async () => {
    await listHabits(OWNER, new Date(), AID);
    const q = find('FROM habits h')!;
    expect(q.text).toContain('AND h.area_id = $2');
    expect(q.params).toEqual([OWNER, AID]);
  });

  it('listProjects filters to the area owner-scoped', async () => {
    await listProjects(OWNER, AID);
    const q = find('FROM projects p')!;
    expect(q.text).toContain('AND p.area_id = $2');
    expect(q.params).toEqual([OWNER, AID]);
  });

  it('listDueTasks filters by the task’s goal’s area, owner-scoped', async () => {
    await listDueTasks(OWNER, AID);
    const q = find('FROM tasks t')!;
    expect(q.text).toContain('AND g.area_id = $2');
    expect(q.params).toEqual([OWNER, AID]);
  });
});
