// Client for the Forge blob store (capability C20). The app UPLOADS files to the platform
// and streams them back through an auth-checked proxy — the bytes live in the platform, the
// app keeps only the returned `blob_id` + metadata (see document_attachments in lib/db.ts).
//
// Per-user ownership (capability C11): every call carries the caller's opaque `owner`
// (the C10 session `userId`). The platform STAMPS it on upload and SCOPES every serve/delete
// to it, so one user can never read or remove another user's blob — a cross-owner GET is a
// 404 (never a 403), so existence never leaks.
//
// Two error postures, matching how each call is triggered:
//   • UPLOAD is USER-INVOKED (a person just picked a file) — it returns a discriminated
//     result so the route can surface a real failure (too large / wrong type / unreachable)
//     rather than silently drop the file. It never throws.
//   • SERVE / DELETE degrade quietly: serve returns the upstream Response (or null) for the
//     route to stream + map a non-200 to a 404; delete is BEST-EFFORT (a failed blob delete
//     must never break the row delete that triggered it), mirroring the C3/C19 write contract.
//
// Base URL is FORGE_EVENTS_URL (dev: the control plane; prod: the data-plane sidecar) — the
// C20 routes live on the same servers as C3/C4/C19. `app` is sent only when FORGE_APP_NAME is
// set (the multi-app control plane needs it; the single-app sidecar infers it), exactly like
// the C3/C4/C19 clients.

const TIMEOUT_MS = 10_000;
// Uploads move up to the 15 MB cap, so they get a longer budget than a metadata round-trip.
const UPLOAD_TIMEOUT_MS = 30_000;

/** Metadata the platform returns for a stored blob. The bytes stay in the platform; the app
 *  persists this (minus checksum) as a document_attachments row. */
export interface BlobMeta {
  blob_id: string;
  content_type: string;
  size: number;
  checksum: string;
  filename?: string;
  created_at: string;
}

/** Outcome of an upload. `ok:false` carries the platform status (0 = unreachable/misconfigured)
 *  so the route can distinguish a client error (413/415/4xx) from a gateway failure. */
export type UploadResult =
  | { ok: true; blob: BlobMeta }
  | { ok: false; status: number; error?: string };

function baseUrl(): string | undefined {
  return process.env.FORGE_EVENTS_URL?.trim() || undefined;
}
function appName(): string | undefined {
  return process.env.FORGE_APP_NAME?.trim() || undefined;
}

/** The owner (+ app, when multi-app) query string shared by serve + delete. */
function scopeParams(owner: string): string {
  const params = new URLSearchParams();
  params.set('owner', owner);
  const app = appName();
  if (app) params.set('app', app);
  return params.toString();
}

/**
 * Upload one file to the platform blob store (app-proxied multipart). Builds the multipart
 * body from the already-parsed file + metadata and POSTs it to `<base>/blobs`. Returns the
 * platform's `{ blob_id, content_type, size, checksum, filename?, created_at }` on 201, or a
 * flagged failure otherwise. Never throws — a network error becomes `{ ok:false, status:0 }`.
 */
export async function uploadBlob(input: {
  owner: string;
  file: Blob;
  contentType: string;
  filename?: string;
  attrs?: Record<string, unknown>;
}): Promise<UploadResult> {
  const base = baseUrl();
  if (!base) return { ok: false, status: 0, error: 'blob storage not configured' };

  const form = new FormData();
  form.append('owner', input.owner);
  form.append('content_type', input.contentType);
  const app = appName();
  if (app) form.append('app', app);
  if (input.filename) form.append('filename', input.filename);
  if (input.attrs) form.append('attrs', JSON.stringify(input.attrs));
  // The file goes LAST so the platform reads the metadata fields first if it streams the parts.
  if (input.filename) form.append('file', input.file, input.filename);
  else form.append('file', input.file);

  try {
    const res = await fetch(`${base}/blobs`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (res.ok) {
      const blob = (await res.json()) as BlobMeta;
      return { ok: true, blob };
    }
    let error: string | undefined;
    try {
      error = ((await res.json()) as { error?: string }).error;
    } catch {
      // non-JSON error body — leave `error` undefined
    }
    return { ok: false, status: res.status, error };
  } catch {
    return { ok: false, status: 0, error: 'blob storage unreachable' };
  }
}

/**
 * Fetch a blob's bytes owner-scoped, for the app's auth-checked serve proxy. Returns the raw
 * upstream Response so the route can stream `res.body` and copy content-type/length; the
 * platform answers 404 for a missing OR cross-owner id (never 403), which the route maps to a
 * 404. Returns null only when the store is unset/unreachable.
 */
export async function getBlobResponse(owner: string, id: string): Promise<Response | null> {
  const base = baseUrl();
  if (!base) return null;
  try {
    return await fetch(`${base}/blobs/${encodeURIComponent(id)}?${scopeParams(owner)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

/**
 * Delete one blob (owner-scoped) — BEST-EFFORT. Called when an attachment row (or its note) is
 * removed; a failure here must never break that delete, so it swallows all errors and returns
 * whether the platform accepted it (callers that care can log it; the row is already gone).
 */
export async function deleteBlob(input: { owner: string; id: string }): Promise<boolean> {
  const base = baseUrl();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/blobs/${encodeURIComponent(input.id)}?${scopeParams(input.owner)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
