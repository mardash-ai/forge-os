// Contract tests for the C19 search client + its pure helpers. `fetch` is mocked so these run
// in the hermetic offline suite. They pin: the exact wire shape (routes, owner in the body →
// owner-scoping), BEST-EFFORT writes (never throw), USER-INVOKED search degrading to an empty
// flagged result on failure, and the snippet/href/label helpers the /search UI renders through.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  deleteDoc,
  hitHref,
  indexDoc,
  parseSnippet,
  reindexDocs,
  search,
  typeLabel,
  type IndexDoc,
} from '../lib/forge-search';

const BASE = 'http://idx:3718';

/** The parsed JSON body of the Nth fetch call. */
function bodyOf(mock: ReturnType<typeof vi.fn>, n = 0): Record<string, unknown> {
  return JSON.parse((mock.mock.calls[n][1] as RequestInit).body as string);
}
function urlOf(mock: ReturnType<typeof vi.fn>, n = 0): string {
  return mock.mock.calls[n][0] as string;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.FORGE_EVENTS_URL = BASE;
  delete process.env.FORGE_APP_NAME;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const GOAL: IndexDoc = { owner: 'user-A', type: 'goal', id: 'g1', title: 'Learn welding', body: 'arc + mig' };

describe('indexDoc — best-effort upsert to /index', () => {
  it('POSTs the doc (owner/type/id/title + body) to <base>/index', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await indexDoc(GOAL);
    expect(urlOf(fetchMock)).toBe(`${BASE}/index`);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
    expect(bodyOf(fetchMock)).toMatchObject({ owner: 'user-A', type: 'goal', id: 'g1', title: 'Learn welding', body: 'arc + mig' });
  });

  it('is a no-op (no fetch) when FORGE_EVENTS_URL is unset — degraded, never a throw', async () => {
    delete process.env.FORGE_EVENTS_URL;
    await expect(indexDoc(GOAL)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('SWALLOWS a network failure — a failed index never breaks the mutation', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    await expect(indexDoc(GOAL)).resolves.toBeUndefined();
  });

  it('sends `app` only when FORGE_APP_NAME is set', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await indexDoc(GOAL);
    expect(bodyOf(fetchMock)).not.toHaveProperty('app');
    fetchMock.mockClear();
    process.env.FORGE_APP_NAME = 'forge-os';
    await indexDoc(GOAL);
    expect(bodyOf(fetchMock)).toMatchObject({ app: 'forge-os' });
  });
});

describe('deleteDoc — best-effort removal from /index/delete', () => {
  it('POSTs { owner, type, id } to <base>/index/delete', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await deleteDoc({ owner: 'user-A', type: 'habit', id: 'h9' });
    expect(urlOf(fetchMock)).toBe(`${BASE}/index/delete`);
    expect(bodyOf(fetchMock)).toEqual({ owner: 'user-A', type: 'habit', id: 'h9' });
  });

  it('swallows a failure (never throws)', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    await expect(deleteDoc({ owner: 'user-A', type: 'habit', id: 'h9' })).resolves.toBeUndefined();
  });
});

describe('search — user-invoked, degrades to empty on any failure', () => {
  it('returns the platform hits/total/took_ms on 200 and carries the caller owner (owner-scoping)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ hits: [{ type: 'goal', id: 'g1', title: 'Learn welding', snippet: 'arc', score: 1 }], total: 1, took_ms: 7 }),
    });
    const res = await search({ owner: 'user-A', q: 'weld', types: ['goal'], limit: 50 });
    expect(urlOf(fetchMock)).toBe(`${BASE}/search`);
    expect(bodyOf(fetchMock)).toMatchObject({ owner: 'user-A', q: 'weld', types: ['goal'], limit: 50 });
    expect(res).toEqual({
      hits: [{ type: 'goal', id: 'g1', title: 'Learn welding', snippet: 'arc', score: 1 }],
      total: 1,
      took_ms: 7,
      degraded: false,
    });
  });

  it('NEVER sends another owner — only the one passed in (owner-scoping)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ hits: [], total: 0 }) });
    await search({ owner: 'user-B', q: 'x' });
    expect(bodyOf(fetchMock).owner).toBe('user-B');
  });

  it('clamps limit to ≤ 100', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ hits: [], total: 0 }) });
    await search({ owner: 'user-A', q: 'x', limit: 9999 });
    expect(bodyOf(fetchMock).limit).toBe(100);
  });

  it('degrades to { hits: [], degraded: true } on a non-2xx', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    expect(await search({ owner: 'user-A', q: 'x' })).toEqual({ hits: [], total: 0, took_ms: 0, degraded: true });
  });

  it('degrades to { hits: [], degraded: true } on a thrown/timeout error', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    expect(await search({ owner: 'user-A', q: 'x' })).toEqual({ hits: [], total: 0, took_ms: 0, degraded: true });
  });

  it('degrades (no fetch) when FORGE_EVENTS_URL is unset', async () => {
    delete process.env.FORGE_EVENTS_URL;
    const res = await search({ owner: 'user-A', q: 'x' });
    expect(res.degraded).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('reindexDocs — bulk backfill to /reindex', () => {
  it('is a no-op success on an empty batch (no fetch)', async () => {
    expect(await reindexDocs('user-A', [])).toEqual({ ok: true, indexed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs { owner, documents } and reports indexed = count on success', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const docs: IndexDoc[] = [GOAL, { owner: 'user-A', type: 'task', id: 't1', title: 'do', attrs: { goalId: 'g1' } }];
    const res = await reindexDocs('user-A', docs);
    expect(urlOf(fetchMock)).toBe(`${BASE}/reindex`);
    expect(bodyOf(fetchMock)).toMatchObject({ owner: 'user-A' });
    expect((bodyOf(fetchMock).documents as unknown[]).length).toBe(2);
    expect(res).toEqual({ ok: true, indexed: 2 });
  });

  it('reports { ok: false, indexed: 0 } when the platform rejects the batch', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    expect(await reindexDocs('user-A', [GOAL])).toEqual({ ok: false, indexed: 0 });
  });
});

describe('typeLabel', () => {
  it('humanizes each type', () => {
    expect(typeLabel('goal')).toBe('Goal');
    expect(typeLabel('task')).toBe('Task');
    expect(typeLabel('project')).toBe('Project');
    expect(typeLabel('area')).toBe('Area');
    expect(typeLabel('habit')).toBe('Habit');
    expect(typeLabel('note')).toBe('Note');
  });
});

describe('hitHref — where a hit links', () => {
  it('goal → /goals/<id>', () => {
    expect(hitHref({ type: 'goal', id: 'g1' })).toBe('/goals/g1');
  });
  it('task → its goal page via attrs.goalId', () => {
    expect(hitHref({ type: 'task', id: 't1', attrs: { goalId: 'g9' } })).toBe('/goals/g9');
  });
  it('task with no goalId falls back to the floor', () => {
    expect(hitHref({ type: 'task', id: 't1' })).toBe('/');
  });
  it('project → /projects/<id>', () => {
    expect(hitHref({ type: 'project', id: 'p1' })).toBe('/projects/p1');
  });
  it('area → /areas, habit → /habits (no detail pages)', () => {
    expect(hitHref({ type: 'area', id: 'a1' })).toBe('/areas');
    expect(hitHref({ type: 'habit', id: 'h1' })).toBe('/habits');
  });
  it('note → /notes/<id>', () => {
    expect(hitHref({ type: 'note', id: 'n1' })).toBe('/notes/n1');
  });
});

describe('parseSnippet — XSS-safe <mark> segmentation', () => {
  it('returns one plain segment when there are no marks', () => {
    expect(parseSnippet('just text')).toEqual([{ text: 'just text', mark: false }]);
  });
  it('splits text around a single <mark>…</mark>', () => {
    expect(parseSnippet('a <mark>b</mark> c')).toEqual([
      { text: 'a ', mark: false },
      { text: 'b', mark: true },
      { text: ' c', mark: false },
    ]);
  });
  it('handles multiple marks', () => {
    expect(parseSnippet('<mark>x</mark> y <mark>z</mark>')).toEqual([
      { text: 'x', mark: true },
      { text: ' y ', mark: false },
      { text: 'z', mark: true },
    ]);
  });
  it('decodes HTML entities in the surrounding (escaped) text', () => {
    expect(parseSnippet('a &amp; b &lt;tag&gt; <mark>&quot;q&quot;</mark>')).toEqual([
      { text: 'a & b <tag> ', mark: false },
      { text: '"q"', mark: true },
    ]);
  });
});
