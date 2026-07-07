import { NextResponse } from 'next/server';
import { buildHealth } from '../../../lib/health';
import { pingDb } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// Standard health/telemetry contract (C6). We declare WHICH checks mean "ready"
// (a required Postgres round-trip); the platform contract in lib/health.ts owns
// the schema + rollup + 200/503 convention.
export async function GET() {
  const { body, httpStatus } = await buildHealth('forge-os', [
    { name: 'db', check: pingDb },
  ]);
  return NextResponse.json(body, { status: httpStatus });
}
