import { NextResponse } from 'next/server';
import { getGoal, updateGoalStatus } from '@/lib/db';
import { isGoalStatus } from '@/lib/goals';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const goal = await getGoal(params.id);
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

  const status = (body as Record<string, unknown>)?.status;
  if (!isGoalStatus(status)) {
    return NextResponse.json(
      { error: 'Status must be one of: active, achieved, archived.' },
      { status: 400 },
    );
  }

  const goal = await updateGoalStatus(params.id, status);
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found.' }, { status: 404 });
  }
  return NextResponse.json(goal);
}
