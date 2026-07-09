import { NextResponse } from 'next/server';
import { createArea, listAreas } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { normalizeColor, validateName } from '@/lib/areas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const owner = await requireOwner();
  const areas = await listAreas(owner);
  return NextResponse.json(areas);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const fields = (body ?? {}) as Record<string, unknown>;
  const name = validateName(fields.name);
  if (!name.ok) {
    return NextResponse.json({ error: 'An area needs a name.' }, { status: 400 });
  }

  const color = normalizeColor(fields.color);
  const owner = await requireOwner();
  const area = await createArea(owner, name.value, color);
  return NextResponse.json(area, { status: 201 });
}
