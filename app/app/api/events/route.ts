import { NextResponse } from 'next/server';
import { listTimelineEvents } from '@/lib/forge-events';
import { requireOwner } from '@/lib/auth';
import { describeEvent } from '@/lib/timeline';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const owner = await requireOwner();
  const goalId = new URL(request.url).searchParams.get('goalId') ?? undefined;
  const events = await listTimelineEvents({ owner, goalId });
  // Attach the derived summary so clients render events without re-deriving it.
  return NextResponse.json(events.map((e) => ({ ...e, summary: describeEvent(e) })));
}
