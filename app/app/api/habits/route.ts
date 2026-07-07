import { NextResponse } from 'next/server';
import { createHabit, listHabits } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { validateTitle } from '@/lib/goals';
import { isCadence } from '@/lib/habits';

export const dynamic = 'force-dynamic';

export async function GET() {
  const owner = await requireOwner();
  const habits = await listHabits(owner, new Date());
  return NextResponse.json(habits);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const rec = (body ?? {}) as Record<string, unknown>;

  const title = validateTitle(rec.title);
  if (!title.ok) {
    return NextResponse.json({ error: 'A habit needs a title.' }, { status: 400 });
  }
  if (!isCadence(rec.cadence)) {
    return NextResponse.json({ error: 'Cadence must be "daily" or "weekly".' }, { status: 400 });
  }

  const owner = await requireOwner();
  const habit = await createHabit(owner, title.value, rec.cadence);
  return NextResponse.json(habit, { status: 201 });
}
