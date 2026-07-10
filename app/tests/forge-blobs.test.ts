// Contract tests for the C20 blob client (lib/forge-blobs). `fetch` is mocked so these run in the
// hermetic offline suite. They pin: the multipart upload wire shape (owner + content_type + file,
// owner-scoping), the discriminated upload result, the owner-scoped serve/delete query strings, and
// the best-effort/degraded error postures.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deleteBlob, getBlobResponse, uploadBlob } from '../lib/forge-blobs';

const BASE = 'http://blobs:3718';

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

function pngBlob(size = 8): Blob {
  return new Blob([new Uint8Array(size)], { type: 'image/png' });
}

describe('uploadBlob — app-proxied multipart POST /blobs', () => {
  it('POSTs a multipart form carrying owner + content_type + file, returns the blob on 201', async () => {
    const blob = { blob_id: 'b1', content_type: 'image/png', size: 8, checksum: 'sha', filename: 'x.png', created_at: 't' };
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => blob });

    const res = await uploadBlob({ owner: 'user-A', file: pngBlob(), contentType: 'image/png', filename: 'x.png' });

    expect(res).toEqual({ ok: true, blob });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/blobs`);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect(form.get('owner')).toBe('user-A');
    expect(form.get('content_type')).toBe('image/png');
    expect(form.get('filename')).toBe('x.png');
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(form.get('app')).toBeNull(); // no FORGE_APP_NAME set
  });

  it('sends `app` only when FORGE_APP_NAME is set', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ blob_id: 'b', content_type: 'image/png', size: 1, checksum: 'c', created_at: 't' }) });
    process.env.FORGE_APP_NAME = 'forge-os';
    await uploadBlob({ owner: 'user-A', file: pngBlob(), contentType: 'image/png' });
    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('app')).toBe('forge-os');
  });

  it('surfaces a 4xx platform rejection (e.g. failed magic-byte sniff) with its status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 415, json: async () => ({ error: 'unsupported' }) });
    const res = await uploadBlob({ owner: 'user-A', file: pngBlob(), contentType: 'image/png' });
    expect(res).toEqual({ ok: false, status: 415, error: 'unsupported' });
  });

  it('returns status 0 when the store is unreachable (never throws)', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const res = await uploadBlob({ owner: 'user-A', file: pngBlob(), contentType: 'image/png' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(0);
  });

  it('returns status 0 (no fetch) when FORGE_EVENTS_URL is unset', async () => {
    delete process.env.FORGE_EVENTS_URL;
    const res = await uploadBlob({ owner: 'user-A', file: pngBlob(), contentType: 'image/png' });
    expect(res).toEqual({ ok: false, status: 0, error: 'blob storage not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getBlobResponse — owner-scoped serve proxy source', () => {
  it('GETs /blobs/:id?owner=<owner> and returns the raw upstream response', async () => {
    const upstream = { ok: true, status: 200, body: {}, headers: new Headers({ 'content-type': 'image/png' }) };
    fetchMock.mockResolvedValue(upstream);
    const res = await getBlobResponse('user-A', 'b1');
    expect(res).toBe(upstream);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url.startsWith(`${BASE}/blobs/b1?`)).toBe(true);
    expect(url).toContain('owner=user-A');
  });

  it('encodes the id and never leaks another owner', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    await getBlobResponse('user-B', 'a/b');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/blobs/a%2Fb?');
    expect(url).toContain('owner=user-B');
  });

  it('returns null on a network error (route maps to 404)', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await getBlobResponse('user-A', 'b1')).toBeNull();
  });
});

describe('deleteBlob — best-effort owner-scoped delete', () => {
  it('DELETEs /blobs/:id?owner=<owner> and returns whether it succeeded', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const ok = await deleteBlob({ owner: 'user-A', id: 'b1' });
    expect(ok).toBe(true);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('DELETE');
    expect((fetchMock.mock.calls[0][0] as string)).toContain('owner=user-A');
  });

  it('swallows a failure (returns false, never throws)', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await deleteBlob({ owner: 'user-A', id: 'b1' })).toBe(false);
  });
});
