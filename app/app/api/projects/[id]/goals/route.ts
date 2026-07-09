import { NextResponse } from 'next/server';
import { addGoalToProject } from '@/lib/db';
import { requireOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Add a goal to this project: POST { goalId }. Owner-scoped — 404 if EITHER the project
// or the goal is unknown or not the owner's (existence never leaks).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const goalId = (body as Record<string, unknown>)?.goalId;
  if (typeof goalId !== 'string' || goalId.length === 0) {
    return NextResponse.json({ error: 'A goalId is required.' }, { status: 400 });
  }

  const owner = await requireOwner();
  const goal = await addGoalToProject(owner, params.id, goalId);
  if (!goal) {
    return NextResponse.json({ error: 'Project or goal not found.' }, { status: 404 });
  }
  return NextResponse.json(goal);
}
