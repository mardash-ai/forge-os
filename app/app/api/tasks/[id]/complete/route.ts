import { NextResponse } from 'next/server';
import { completeTask } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const task = await completeTask(params.id);
  if (!task) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }
  return NextResponse.json(task);
}
