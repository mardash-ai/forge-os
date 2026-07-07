import { NextResponse } from 'next/server';
import { setTaskDueDate } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { isValidDateString } from '@/lib/schedule';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const raw = (body as Record<string, unknown>)?.dueDate;
  let dueDate: string | null;
  if (raw === null) {
    dueDate = null;
  } else if (isValidDateString(raw)) {
    dueDate = raw;
  } else {
    return NextResponse.json({ error: 'dueDate must be a date (YYYY-MM-DD) or null.' }, { status: 400 });
  }

  const owner = await requireOwner();
  const task = await setTaskDueDate(owner, params.id, dueDate);
  if (!task) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }
  return NextResponse.json(task);
}
