import { NextResponse } from 'next/server';
import { getGoal, recordAgentRun } from '@/lib/db';
import { generatePlan, isPlannerConfigured } from '@/lib/agent';
import { PLANNER_MODEL } from '@/lib/planner';

export const dynamic = 'force-dynamic';

// Draft tasks for a goal with the Planner agent. The human reviews and accepts
// the result on the client; nothing is written to tasks here.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const goal = await getGoal(params.id);
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found.' }, { status: 404 });
  }

  // Missing key is a configuration gate, not a crash — the rest of the app works.
  if (!isPlannerConfigured()) {
    return NextResponse.json(
      { error: 'AI planning is unavailable. Set an ANTHROPIC_API_KEY to let the Planner draft tasks.' },
      { status: 503 },
    );
  }

  try {
    const plan = await generatePlan({ title: goal.title, description: goal.description });
    const run = await recordAgentRun({
      goalId: goal.id,
      kind: 'planner',
      status: 'succeeded',
      model: plan.model,
      result: { tasks: plan.tasks },
      error: null,
    });
    return NextResponse.json({ runId: run.id, model: plan.model, tasks: plan.tasks });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    await recordAgentRun({
      goalId: goal.id,
      kind: 'planner',
      status: 'failed',
      model: PLANNER_MODEL,
      result: null,
      error: message,
    });
    return NextResponse.json(
      { error: "The Planner couldn't draft tasks just now. Try again." },
      { status: 502 },
    );
  }
}
