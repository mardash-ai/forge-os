import { NextResponse } from 'next/server';
import { listActiveNotifications } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await listActiveNotifications(new Date()));
}
