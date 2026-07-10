import { NextResponse } from 'next/server';
import { addAttachment, getDocument } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { uploadBlob, deleteBlob } from '@/lib/forge-blobs';
import { attachmentRejectionMessage, validateAttachment } from '@/lib/documents';

// Node runtime: we build an outbound multipart body (undici FormData/Blob) to proxy the file to
// the platform blob store (C20). force-dynamic so the upload is never statically optimized.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Upload a file to a note (the C20 wiring). Flow: gate on the session (requireOwner), confirm the
 * note is the caller's, parse the multipart `file`, validate size + type app-side (the platform
 * also sniffs magic bytes), stream it to the platform `POST /blobs` (owner = session userId), then
 * persist the returned blob_id + metadata as a document_attachments row. If the row write fails
 * after the upload, best-effort delete the just-created blob so we don't leak it.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();

  // Owner-scoped: another user's note (or a missing one) is a 404, never a 403.
  const doc = await getDocument(owner, params.id);
  if (!doc) {
    return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart form upload.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file in the upload (field "file").' }, { status: 400 });
  }

  // App-side mirror of the C20 limits (fast feedback; the platform enforces them too).
  const check = validateAttachment({ contentType: file.type, size: file.size });
  if (!check.ok) {
    const status = check.reason === 'size' ? 413 : check.reason === 'type' ? 415 : 400;
    return NextResponse.json({ error: attachmentRejectionMessage(check.reason) }, { status });
  }

  const filename = file.name || 'upload';
  const up = await uploadBlob({ owner, file, contentType: check.contentType, filename });
  if (!up.ok) {
    // A client-shaped rejection from the platform (e.g. failed magic-byte sniff) is surfaced as-is;
    // anything else is a gateway failure.
    const status = up.status >= 400 && up.status < 500 ? up.status : 502;
    return NextResponse.json({ error: up.error ?? 'The file could not be stored.' }, { status });
  }

  const att = await addAttachment(owner, params.id, {
    blobId: up.blob.blob_id,
    filename: up.blob.filename ?? filename,
    contentType: up.blob.content_type ?? check.contentType,
    size: up.blob.size ?? file.size,
  });
  if (!att) {
    // The note vanished between the two calls (rare). Don't leak the blob we just stored.
    await deleteBlob({ owner, id: up.blob.blob_id });
    return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
  }
  return NextResponse.json(att, { status: 201 });
}
