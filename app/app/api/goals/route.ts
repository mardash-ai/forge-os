import { NextResponse } from 'next/server';
import { createGoal, listGoals } from '@/lib/db';
import { validateTitle } from '@/lib/goals';

export const dynamic = 'force-dynamic';

export async function GET() {
  const goals = await listGoals();
  return NextResponse.json(goals);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const fields = (body ?? {}) as Record<string, unknown>;
  const title = validateTitle(fields.title);
  if (!title.ok) {
    return NextResponse.json({ error: 'A goal needs a title.' }, { status: 400 });
  }

  const description = typeof fields.description === 'string' ? fields.description.trim() : '';
  const goal = await createGoal(title.value, description);
  return NextResponse.json(goal, { status: 201 });
}
