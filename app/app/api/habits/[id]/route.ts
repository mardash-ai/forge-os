import { NextResponse } from 'next/server';
import { deleteHabit, setHabitArea } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { parseAreaIdField } from '@/lib/areas';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  const ok = await deleteHabit(owner, params.id);
  if (!ok) {
    return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// Tagging (A2): set/clear this habit's Area. `null` clears; a foreign/unknown area or habit
// is a 404 (setHabitArea is owner-scoped and refuses an Area you don't own).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const fields = (body ?? {}) as Record<string, unknown>;

  const areaField = parseAreaIdField(fields);
  if (areaField.kind === 'absent' || areaField.kind === 'invalid') {
    return NextResponse.json({ error: 'areaId must be an area id or null.' }, { status: 400 });
  }

  const owner = await requireOwner();
  const habit = await setHabitArea(owner, params.id, areaField.kind === 'set' ? areaField.areaId : null);
  if (!habit) {
    return NextResponse.json({ error: 'Habit or area not found.' }, { status: 404 });
  }
  return NextResponse.json(habit);
}
