import { NextResponse } from 'next/server';
import { getGoal } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { runAgentTask, AgentRunUnavailableError } from '@/lib/forge-agent';
import {
  PLANNER_MODEL,
  PLAN_RESPONSE_SCHEMA,
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  cleanProposedTasks,
} from '@/lib/planner';

export const dynamic = 'force-dynamic';

// Draft tasks for a goal with the Planner agent. The model call, structured-output
// enforcement, and durable run history all live in the platform's agent runtime (C1); this
// route just hands over the Planner's DOMAIN — system prompt, input, tasks JSON Schema — and
// post-validates the (untrusted) result. The human reviews and accepts the proposals on the
// client; nothing is written to `tasks` here.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  const goal = await getGoal(owner, params.id);
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found.' }, { status: 404 });
  }

  try {
    const task = await runAgentTask({
      owner,
      capability: 'planner',
      system: buildPlannerSystemPrompt(),
      input: buildPlannerUserPrompt({ title: goal.title, description: goal.description }),
      schema: PLAN_RESPONSE_SCHEMA,
      model: PLANNER_MODEL,
      maxTokens: 1024,
    });
    // Even a schema-valid artifact is UNTRUSTED model output — run our own policy over it
    // (trim, drop empties/dupes, cap the count) before it can reach the review UI.
    const tasks = cleanProposedTasks(task.artifact);
    return NextResponse.json({ runId: task.id, model: task.model, tasks });
  } catch (err) {
    // Missing/unconfigured model key is a configuration gate, not a crash — the platform 503s
    // (no run persisted) and so do we; the rest of the app keeps working.
    if (err instanceof AgentRunUnavailableError) {
      return NextResponse.json(
        { error: 'AI planning is unavailable. Set an ANTHROPIC_API_KEY to let the Planner draft tasks.' },
        { status: 503 },
      );
    }
    // A durable run failure (or an unreachable/malformed runtime) — the platform recorded the
    // failed run; the app just reports a transient error.
    return NextResponse.json(
      { error: "The Planner couldn't draft tasks just now. Try again." },
      { status: 502 },
    );
  }
}
