// Impure agent layer: the one Anthropic call the Planner makes. Kept separate
// from the pure logic (lib/planner.ts) and the DB (lib/db.ts) so neither the
// unit tests nor the rest of the app depend on a network or an API key.

import Anthropic from '@anthropic-ai/sdk';
import {
  PLANNER_MODEL,
  PLAN_RESPONSE_SCHEMA,
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  cleanProposedTasks,
  type PlannerGoalInput,
  type ProposedTask,
} from './planner';

/** True when an API key is present, so the app can 503 gracefully without one. */
export function isPlannerConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
}

export interface GeneratedPlan {
  model: string;
  tasks: ProposedTask[];
}

/** Concatenate the text blocks of a message into one string. */
function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * Ask the model to draft tasks for a goal. Returns cleaned proposals. Throws on
 * a missing key, a network/model failure, or an unparseable response — the route
 * catches, records a failed run, and answers with a clear status (never a 500).
 */
export async function generatePlan(goal: PlannerGoalInput): Promise<GeneratedPlan> {
  if (!isPlannerConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  const client = new Anthropic();
  const message = await client.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 1024,
    system: buildPlannerSystemPrompt(),
    messages: [{ role: 'user', content: buildPlannerUserPrompt(goal) }],
    // Structured outputs: constrain the response to our schema so we get JSON,
    // not prose. Low effort keeps this quick — task drafting is not deep reasoning.
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: PLAN_RESPONSE_SCHEMA },
    },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(textOf(message));
  } catch {
    throw new Error('Planner returned an unparseable response');
  }

  return { model: message.model ?? PLANNER_MODEL, tasks: cleanProposedTasks(parsed) };
}
