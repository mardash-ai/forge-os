import { NextResponse } from 'next/server';
import { checkInHabit, uncheckHabit } from '@/lib/db';
import { requireOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Stoke: mark the current period done (idempotent).
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  const habit = await checkInHabit(owner, params.id, new Date());
  if (!habit) {
    return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });
  }
  return NextResponse.json(habit);
}

// Undo the current period's check-in.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  const habit = await uncheckHabit(owner, params.id, new Date());
  if (!habit) {
    return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });
  }
  return NextResponse.json(habit);
}
