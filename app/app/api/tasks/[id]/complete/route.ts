import { NextResponse } from 'next/server';
import { completeTask } from '@/lib/db';
import { requireOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  const task = await completeTask(owner, params.id);
  if (!task) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }
  return NextResponse.json(task);
}
