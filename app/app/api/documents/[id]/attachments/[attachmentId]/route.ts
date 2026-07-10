import { NextResponse } from 'next/server';
import { deleteAttachment } from '@/lib/db';
import { requireOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Remove one attachment from a note: deletes the row (owner + note scoped) and best-effort drops
 *  the platform blob (C20). A missing / cross-owner attachment is a 404 (never a 403). */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; attachmentId: string } },
) {
  const owner = await requireOwner();
  const ok = await deleteAttachment(owner, params.id, params.attachmentId);
  if (!ok) {
    return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
