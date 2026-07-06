import { NextResponse } from 'next/server';
import { addTask } from '@/lib/db';
import { validateTitle } from '@/lib/goals';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const title = validateTitle((body as Record<string, unknown>)?.title);
  if (!title.ok) {
    return NextResponse.json({ error: 'A task needs a title.' }, { status: 400 });
  }

  const task = await addTask(params.id, title.value);
  if (!task) {
    return NextResponse.json({ error: 'Goal not found.' }, { status: 404 });
  }
  return NextResponse.json(task, { status: 201 });
}
