import { NextResponse } from 'next/server';
import { dismissNotification } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const key = (body as Record<string, unknown>)?.key;
  if (typeof key !== 'string' || key.length === 0) {
    return NextResponse.json({ error: 'A notification key is required.' }, { status: 400 });
  }

  // Any key is accepted idempotently — dismissing an unknown key is a no-op.
  await dismissNotification(key);
  return NextResponse.json({ ok: true });
}
