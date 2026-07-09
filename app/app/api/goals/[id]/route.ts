import { NextResponse } from 'next/server';
import { getGoal, setGoalArea, updateGoalStatus } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { isGoalStatus } from '@/lib/goals';
import { parseAreaIdField } from '@/lib/areas';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  // getGoal is owner-scoped, so another user's goal returns null → 404 (never 403).
  const goal = await getGoal(owner, params.id);
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found.' }, { status: 404 });
  }
  return NextResponse.json(goal);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const fields = (body ?? {}) as Record<string, unknown>;
  const owner = await requireOwner();

  // Tagging (A2): set/clear this goal's Area. `null` clears; a foreign/unknown area or goal
  // is a 404 (setGoalArea is owner-scoped and refuses an Area you don't own).
  const areaField = parseAreaIdField(fields);
  if (areaField.kind !== 'absent') {
    if (areaField.kind === 'invalid') {
      return NextResponse.json({ error: 'areaId must be an area id or null.' }, { status: 400 });
    }
    const tagged = await setGoalArea(owner, params.id, areaField.kind === 'set' ? areaField.areaId : null);
    if (!tagged) {
      return NextResponse.json({ error: 'Goal or area not found.' }, { status: 404 });
    }
    return NextResponse.json(tagged);
  }

  const status = fields.status;
  if (!isGoalStatus(status)) {
    return NextResponse.json(
      { error: 'Status must be one of: active, achieved, archived.' },
      { status: 400 },
    );
  }

  const goal = await updateGoalStatus(owner, params.id, status);
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found.' }, { status: 404 });
  }
  return NextResponse.json(goal);
}
