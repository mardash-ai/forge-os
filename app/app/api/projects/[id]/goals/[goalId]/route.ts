import { NextResponse } from 'next/server';
import { removeGoalFromProject } from '@/lib/db';
import { requireOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Remove a goal from this project (nulls its FK; the goal itself is untouched).
// Owner-scoped and only if the goal is actually in THIS project → else 404.
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; goalId: string } },
) {
  const owner = await requireOwner();
  const ok = await removeGoalFromProject(owner, params.id, params.goalId);
  if (!ok) {
    return NextResponse.json({ error: 'Goal is not in this project.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
