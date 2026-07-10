// Data-layer tests for B1 notes + their C20 attachments. The `pg` Pool, the C3 event client, the
// C19 search client, and the C20 blob client are all mocked, so these run in the hermetic offline
// suite yet exercise the real db.ts wiring: owner-scoping, note search-indexing (type `note`),
// attachment records, the delete cascade + best-effort blob cleanup, and link-ownership guards.

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
    deleteDocSpy: vi.fn(async (_input?: unknown) => undefined),
    deleteBlobSpy: vi.fn(async (_input?: unknown) => true),
  };
});

vi.mock('pg', () => ({ Pool: hoisted.FakePool }));
vi.mock('../lib/forge-events', () => ({
  emitAppEvent: hoisted.emitSpy,
  latestActivityBySubject: vi.fn(async () => ({})),
}));
vi.mock('../lib/forge-search', () => ({
  indexDoc: hoisted.indexSpy,
  deleteDoc: hoisted.deleteDocSpy,
}));
vi.mock('../lib/forge-blobs', () => ({
  deleteBlob: hoisted.deleteBlobSpy,
}));

import {
  addAttachment,
  createDocument,
  deleteAttachment,
  deleteDocument,
  getDocument,
  updateDocument,
} from '../lib/db';

const OWNER = 'user-A';
const DID = '66666666-6666-6666-6666-666666666666';
const ATT = '77777777-7777-7777-7777-777777777777';
const GID = '22222222-2222-2222-2222-222222222222';
const PID = '11111111-1111-1111-1111-111111111111';

function dataCalls() {
  return hoisted.calls.filter((c) => !c.text.includes('CREATE TABLE IF NOT EXISTS'));
}
function find(substr: string) {
  return dataCalls().find((c) => c.text.includes(substr));
}
function docRow(over: Record<string, unknown> = {}) {
  return {
    id: DID,
    title: 'Kitchen plan',
    body_md: 'Do **this**',
    goal_id: null,
    project_id: null,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-02'),
    ...over,
  };
}

beforeEach(() => {
  hoisted.calls.length = 0;
  hoisted.state.handler = () => [];
  hoisted.emitSpy.mockClear();
  hoisted.indexSpy.mockClear();
  hoisted.indexSpy.mockImplementation(async () => undefined);
  hoisted.deleteDocSpy.mockClear();
  hoisted.deleteDocSpy.mockImplementation(async () => undefined);
  hoisted.deleteBlobSpy.mockClear();
  hoisted.deleteBlobSpy.mockImplementation(async () => true);
});

describe('createDocument', () => {
  it('inserts the note owner-scoped, emits document.created, and indexes it (type note)', async () => {
    hoisted.state.handler = (t) => (t.includes('INSERT INTO documents') ? [docRow()] : []);
    const doc = await createDocument(OWNER, { title: 'Kitchen plan', bodyMd: 'Do **this**' });
    expect(doc).toMatchObject({ id: DID, title: 'Kitchen plan', bodyMd: 'Do **this**', attachments: [] });

    const insert = find('INSERT INTO documents')!;
    expect(insert.params[0]).toBe(OWNER); // owner_id first

    expect(hoisted.emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ owner: OWNER, type: 'document.created', subject: DID }),
    );
    expect(hoisted.indexSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.indexSpy.mock.calls[0][0]).toMatchObject({
      owner: OWNER,
      type: 'note',
      id: DID,
      title: 'Kitchen plan',
      body: 'Do **this**',
    });
  });

  it('refuses a Goal link the caller does not own (→ null, no insert)', async () => {
    // The ownership probe SELECT returns nothing → foreign/unknown goal.
    hoisted.state.handler = (t) => (t.includes('FROM goals WHERE id = $1 AND owner_id = $2') ? [] : [docRow()]);
    const doc = await createDocument(OWNER, { title: 'x', bodyMd: '', goalId: GID });
    expect(doc).toBeNull();
    expect(find('INSERT INTO documents')).toBeUndefined();
    expect(hoisted.indexSpy).not.toHaveBeenCalled();
  });

  it('accepts an owned Project link', async () => {
    hoisted.state.handler = (t) => {
      if (t.includes('SELECT id FROM projects')) return [{ id: PID }]; // ownership probe
      if (t.includes('INSERT INTO documents')) return [docRow({ project_id: PID })];
      if (t.includes('SELECT title FROM projects')) return [{ title: 'Reno' }]; // link title
      return [];
    };
    const doc = await createDocument(OWNER, { title: 'x', bodyMd: '', projectId: PID });
    expect(doc).toMatchObject({ projectId: PID, projectTitle: 'Reno' });
  });

  it('still returns the note when indexing fails (best-effort)', async () => {
    hoisted.state.handler = (t) => (t.includes('INSERT INTO documents') ? [docRow()] : []);
    hoisted.indexSpy.mockRejectedValueOnce(new Error('index down'));
    const doc = await createDocument(OWNER, { title: 'x', bodyMd: '' });
    expect(doc).toMatchObject({ id: DID });
  });
});

describe('getDocument — owner-scoped', () => {
  it('reads the note + its attachments filtered by owner (a foreign note → null)', async () => {
    hoisted.state.handler = (t) => {
      if (t.includes('FROM documents d') && t.includes('d.owner_id = $2')) return [docRow({ goal_title: null, project_title: null })];
      if (t.includes('FROM document_attachments WHERE document_id = $1 AND owner_id = $2'))
        return [{ id: ATT, document_id: DID, blob_id: 'b1', filename: 'a.png', content_type: 'image/png', size: 10, created_at: new Date() }];
      return [];
    };
    const doc = await getDocument(OWNER, DID);
    expect(doc).not.toBeNull();
    expect(doc!.attachments).toHaveLength(1);
    expect(doc!.attachments[0]).toMatchObject({ blobId: 'b1', filename: 'a.png', contentType: 'image/png', size: 10 });
    // both queries carry the owner
    expect(find('FROM documents d')!.params).toEqual([DID, OWNER]);
    expect(find('FROM document_attachments WHERE document_id = $1 AND owner_id = $2')!.params).toEqual([DID, OWNER]);
  });

  it('returns null for a malformed id without touching the db', async () => {
    expect(await getDocument(OWNER, 'not-a-uuid')).toBeNull();
    expect(dataCalls()).toHaveLength(0);
  });
});

describe('updateDocument', () => {
  it('updates owner-scoped and re-indexes the note', async () => {
    hoisted.state.handler = (t) => (t.includes('UPDATE documents') && t.includes('body_md = $3') ? [docRow({ title: 'New', body_md: 'edited' })] : []);
    const doc = await updateDocument(OWNER, DID, { title: 'New', bodyMd: 'edited' });
    expect(doc).toMatchObject({ title: 'New', bodyMd: 'edited' });
    const upd = find('UPDATE documents')!;
    expect(upd.text).toContain('updated_at = now()');
    expect(upd.params[upd.params.length - 1]).toBe(OWNER); // owner in the WHERE
    expect(hoisted.indexSpy.mock.calls[0][0]).toMatchObject({ type: 'note', id: DID, title: 'New', body: 'edited' });
  });
});

describe('deleteDocument — cascade + best-effort cleanup', () => {
  it('deletes owner-scoped, drops each blob, and removes the search doc', async () => {
    hoisted.state.handler = (t) => {
      if (t.includes('SELECT blob_id FROM document_attachments')) return [{ blob_id: 'b1' }, { blob_id: 'b2' }];
      if (t.includes('DELETE FROM documents')) return [{ id: DID }];
      return [];
    };
    const ok = await deleteDocument(OWNER, DID);
    expect(ok).toBe(true);
    expect(find('DELETE FROM documents')!.params).toEqual([DID, OWNER]);
    expect(hoisted.deleteBlobSpy).toHaveBeenCalledTimes(2);
    expect(hoisted.deleteBlobSpy.mock.calls.map((c) => (c[0] as { id: string }).id)).toEqual(['b1', 'b2']);
    expect(hoisted.deleteDocSpy).toHaveBeenCalledWith({ owner: OWNER, type: 'note', id: DID });
  });

  it('is a no-op (false) when nothing matched — no blob/index calls', async () => {
    hoisted.state.handler = () => [];
    expect(await deleteDocument(OWNER, DID)).toBe(false);
    expect(hoisted.deleteBlobSpy).not.toHaveBeenCalled();
    expect(hoisted.deleteDocSpy).not.toHaveBeenCalled();
  });
});

describe('addAttachment', () => {
  it('records the row only after confirming the note is the owner’s', async () => {
    hoisted.state.handler = (t) => {
      if (t.includes('SELECT id FROM documents WHERE id = $1 AND owner_id = $2')) return [{ id: DID }];
      if (t.includes('INSERT INTO document_attachments'))
        return [{ id: ATT, document_id: DID, blob_id: 'b9', filename: 'f.pdf', content_type: 'application/pdf', size: 20, created_at: new Date() }];
      return [];
    };
    const att = await addAttachment(OWNER, DID, { blobId: 'b9', filename: 'f.pdf', contentType: 'application/pdf', size: 20 });
    expect(att).toMatchObject({ id: ATT, blobId: 'b9', contentType: 'application/pdf', size: 20 });
    const insert = find('INSERT INTO document_attachments')!;
    expect(insert.params[0]).toBe(DID);
    expect(insert.params[1]).toBe(OWNER); // inherits the note's owner
  });

  it('returns null (no insert) when the note is not the owner’s', async () => {
    hoisted.state.handler = () => []; // ownership probe finds nothing
    const att = await addAttachment(OWNER, DID, { blobId: 'b9', filename: 'f.pdf', contentType: 'application/pdf', size: 20 });
    expect(att).toBeNull();
    expect(find('INSERT INTO document_attachments')).toBeUndefined();
  });
});

describe('deleteAttachment', () => {
  it('removes the row (owner + note scoped) and best-effort drops the blob', async () => {
    hoisted.state.handler = (t) => (t.includes('DELETE FROM document_attachments') ? [{ blob_id: 'b1' }] : []);
    const ok = await deleteAttachment(OWNER, DID, ATT);
    expect(ok).toBe(true);
    const del = find('DELETE FROM document_attachments')!;
    expect(del.params).toEqual([ATT, DID, OWNER]);
    expect(hoisted.deleteBlobSpy).toHaveBeenCalledWith({ owner: OWNER, id: 'b1' });
  });

  it('returns false and skips the blob delete when nothing matched', async () => {
    hoisted.state.handler = () => [];
    expect(await deleteAttachment(OWNER, DID, ATT)).toBe(false);
    expect(hoisted.deleteBlobSpy).not.toHaveBeenCalled();
  });
});
