import { NextResponse } from 'next/server';
import { syncNotifications } from '@/lib/notification-inbox';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await syncNotifications(new Date()));
}
