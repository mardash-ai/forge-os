import { NextResponse } from 'next/server';
import { syncNotifications } from '@/lib/notification-inbox';
import { requireOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const owner = await requireOwner();
  return NextResponse.json(await syncNotifications(owner, new Date()));
}
