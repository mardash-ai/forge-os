import { NextResponse } from 'next/server';
import { listDueTasks } from '@/lib/db';
import { bucketFor } from '@/lib/schedule';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  const tasks = await listDueTasks();
  return NextResponse.json(tasks.map((t) => ({ ...t, bucket: bucketFor(t.dueDate, now) })));
}
