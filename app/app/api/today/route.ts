import { NextResponse } from 'next/server';
import { listDueTasks } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { bucketFor } from '@/lib/schedule';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  const owner = await requireOwner();
  const tasks = await listDueTasks(owner);
  return NextResponse.json(tasks.map((t) => ({ ...t, bucket: bucketFor(t.dueDate, now) })));
}
