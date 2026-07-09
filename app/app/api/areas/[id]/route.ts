import { NextResponse } from 'next/server';
import { deleteArea, getArea, updateArea } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { normalizeColor, validateName } from '@/lib/areas';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  // getArea is owner-scoped, so another user's area returns null → 404 (never 403).
  const area = await getArea(owner, params.id);
  if (!area) {
    return NextResponse.json({ error: 'Area not found.' }, { status: 404 });
  }
  return NextResponse.json(area);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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
  // A color is optional; when present it's normalized to a #rrggbb hex or '' (no accent).
  const color = 'color' in fields ? normalizeColor(fields.color) : undefined;

  const owner = await requireOwner();
  const area = await updateArea(owner, params.id, { name: name.value, color });
  if (!area) {
    return NextResponse.json({ error: 'Area not found.' }, { status: 404 });
  }
  return NextResponse.json(area);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  // Owner-scoped delete. The ON DELETE SET NULL FK nulls area_id on every tagged Goal/Habit/
  // Project, so those resources survive untagged — deleting an Area never deletes them.
  const ok = await deleteArea(owner, params.id);
  if (!ok) {
    return NextResponse.json({ error: 'Area not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
