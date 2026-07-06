import { NextResponse } from 'next/server';
import { deleteHabit } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const ok = await deleteHabit(params.id);
  if (!ok) {
    return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
