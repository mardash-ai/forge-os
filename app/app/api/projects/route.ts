import { NextResponse } from 'next/server';
import { createProject, listProjects } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { validateTitle } from '@/lib/goals';

export const dynamic = 'force-dynamic';

export async function GET() {
  const owner = await requireOwner();
  const projects = await listProjects(owner);
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const fields = (body ?? {}) as Record<string, unknown>;
  const title = validateTitle(fields.title);
  if (!title.ok) {
    return NextResponse.json({ error: 'A project needs a title.' }, { status: 400 });
  }

  const description = typeof fields.description === 'string' ? fields.description.trim() : '';
  const owner = await requireOwner();
  const project = await createProject(owner, title.value, description);
  return NextResponse.json(project, { status: 201 });
}
