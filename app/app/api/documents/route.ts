import { NextResponse } from 'next/server';
import { createDocument, listDocuments } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { validateTitle } from '@/lib/goals';

export const dynamic = 'force-dynamic';

/** A link field: a non-empty string id, or null to leave it unlinked. */
function parseLink(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function GET() {
  const owner = await requireOwner();
  const documents = await listDocuments(owner);
  return NextResponse.json(documents);
}

export async function POST(request: Request) {
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
  // A foreign/malformed Goal or Project link → null from the db layer, mapped to a 400 (you can
  // only link a note to your own goal/project).
  const doc = await createDocument(owner, {
    title: title.value,
    bodyMd,
    goalId: parseLink(fields.goalId),
    projectId: parseLink(fields.projectId),
  });
  if (!doc) {
    return NextResponse.json({ error: 'That goal or project could not be linked.' }, { status: 400 });
  }
  return NextResponse.json(doc, { status: 201 });
}
