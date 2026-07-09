import { NextResponse } from 'next/server';
import { getProject, setProjectStatus, updateProject } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { validateTitle } from '@/lib/goals';
import { isProjectStatus } from '@/lib/projects';

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
