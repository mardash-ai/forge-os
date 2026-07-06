import { NextResponse } from 'next/server';
import { finalizeHabitStreaks } from '@/lib/db';

export const dynamic = 'force-dynamic';

// C2 scheduler callback — registered to run at each period boundary (UTC midnight):
//   forge schedule --app forge-os --name habits-finalize --cron "5 0 * * *" \
//     --target /api/cron/habits-finalize
//
// Settles the period that just closed for every habit and persists a durable
// marker for any streak that broke — the boundary record read-time derivation
// can't produce. Idempotent: safe under the scheduler's retries and re-fires
// (UNIQUE(habit_id, period) means a re-run records nothing new), so a double or
// delayed call never double-counts. Returns 200 with a summary of what it did.
export async function POST() {
  try {
    const breaks = await finalizeHabitStreaks(new Date());
    return NextResponse.json({ ok: true, recorded: breaks.length, breaks });
  } catch (err) {
    // Surface a 5xx so the scheduler retries with backoff; the operation is
    // idempotent, so a retry after a partial failure is safe.
    const message = err instanceof Error ? err.message : 'finalize failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
