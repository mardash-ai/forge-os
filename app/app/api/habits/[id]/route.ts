import { NextResponse } from 'next/server';
import { deleteHabit } from '@/lib/db';
import { requireOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  const ok = await deleteHabit(owner, params.id);
  if (!ok) {
    return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
