import { NextResponse } from 'next/server';
import { getProject, setProjectArea, setProjectStatus, updateProject } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { validateTitle } from '@/lib/goals';
import { isProjectStatus } from '@/lib/projects';
import { parseAreaIdField } from '@/lib/areas';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  // getProject is owner-scoped, so another user's project returns null → 404 (never 403).
  const project = await getProject(owner, params.id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const fields = (body ?? {}) as Record<string, unknown>;
  const owner = await requireOwner();

  // Tagging (A2): set/clear this project's Area is its own path. `null` clears; a foreign/
  // unknown area or project is a 404 (setProjectArea is owner-scoped).
  const areaField = parseAreaIdField(fields);
  if (areaField.kind !== 'absent') {
    if (areaField.kind === 'invalid') {
      return NextResponse.json({ error: 'areaId must be an area id or null.' }, { status: 400 });
    }
    const tagged = await setProjectArea(owner, params.id, areaField.kind === 'set' ? areaField.areaId : null);
    if (!tagged) {
      return NextResponse.json({ error: 'Project or area not found.' }, { status: 404 });
    }
    return NextResponse.json(tagged);
  }

  // A status change (active/archived) is its own path — archiving detaches member goals.
  if ('status' in fields) {
    if (!isProjectStatus(fields.status)) {
      return NextResponse.json({ error: 'Status must be one of: active, archived.' }, { status: 400 });
    }
    const project = await setProjectStatus(owner, params.id, fields.status);
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    return NextResponse.json(project);
  }

  // Otherwise it's a content edit (title required; description optional).
  const title = validateTitle(fields.title);
  if (!title.ok) {
    return NextResponse.json({ error: 'A project needs a title.' }, { status: 400 });
  }
  const description = typeof fields.description === 'string' ? fields.description.trim() : undefined;
  const project = await updateProject(owner, params.id, { title: title.value, description });
  if (!project) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }
  return NextResponse.json(project);
}
