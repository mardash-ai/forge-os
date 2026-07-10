import { NextResponse } from 'next/server';
import { deleteDocument, getDocument, updateDocument } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { validateTitle } from '@/lib/goals';

export const dynamic = 'force-dynamic';

/** A link field: a non-empty string id, or null to leave/clear it unlinked. */
function parseLink(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  // getDocument is owner-scoped, so another user's note returns null → 404 (never 403).
  const doc = await getDocument(owner, params.id);
  if (!doc) {
    return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
  }
  return NextResponse.json(doc);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const fields = (body ?? {}) as Record<string, unknown>;
  const title = validateTitle(fields.title);
  if (!title.ok) {
    return NextResponse.json({ error: 'A note needs a title.' }, { status: 400 });
  }
  const bodyMd = typeof fields.bodyMd === 'string' ? fields.bodyMd : '';
  const owner = await requireOwner();
  const doc = await updateDocument(owner, params.id, {
    title: title.value,
    bodyMd,
    goalId: parseLink(fields.goalId),
    projectId: parseLink(fields.projectId),
  });
  if (!doc) {
    // Either the note isn't the owner's (→ 404) or a link isn't theirs. A missing note is the
    // common case; report 404 so existence never leaks.
    const exists = await getDocument(owner, params.id);
    if (!exists) return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
    return NextResponse.json({ error: 'That goal or project could not be linked.' }, { status: 400 });
  }
  return NextResponse.json(doc);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  const ok = await deleteDocument(owner, params.id);
  if (!ok) {
    return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
