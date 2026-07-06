import { NextResponse } from 'next/server';
import { listEvents } from '@/lib/db';
import { describeEvent } from '@/lib/timeline';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const goalId = new URL(request.url).searchParams.get('goalId') ?? undefined;
  const events = await listEvents({ goalId });
  // Attach the derived summary so clients render events without re-deriving it.
  return NextResponse.json(events.map((e) => ({ ...e, summary: describeEvent(e) })));
}
