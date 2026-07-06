// Pure logic for the Planner agent — no I/O, so it is unit-testable in Node.
// The impure Anthropic call lives in lib/agent.ts; persistence in lib/db.ts.
// Everything the model returns is treated as UNTRUSTED and cleaned here before
// it can reach the database or the UI.

export const PLANNER_MODEL = 'claude-opus-4-8';

/** A goal never yields an unbounded task list — cap the proposal. */
export const MAX_PROPOSED_TASKS = 8;

/** Defensive ceiling on any single title (model output is untrusted). */
export const MAX_TITLE_LENGTH = 200;

/** A single task the Planner proposes. Not a real Task until the human accepts. */
export interface ProposedTask {
  title: string;
}

/** The goal fields the Planner reasons over. */
export interface PlannerGoalInput {
  title: string;
  description: string;
}

/** System prompt: fixes the agent's role and output contract. */
export function buildPlannerSystemPrompt(): string {
  return [
    'You are the Planner, an agent inside a personal goal-tracking app.',
    'Given a single goal, break it into a short list of concrete, actionable next-step tasks.',
    'Rules:',
    `- Propose between 3 and ${MAX_PROPOSED_TASKS} tasks — no more.`,
    '- Each task is one short imperative title (e.g. "Draft the outline"), not a paragraph.',
    '- Tasks must be specific to THIS goal, ordered as a sensible sequence of first steps.',
    '- No numbering, no bullets, no commentary — only the task titles.',
    'Return your answer using the provided JSON schema.',
  ].join('\n');
}

/** User prompt: the goal itself. */
export function buildPlannerUserPrompt(goal: PlannerGoalInput): string {
  const title = goal.title.trim();
  const description = goal.description.trim();
  const lines = [`Goal: ${title}`];
  if (description) lines.push(`Details: ${description}`);
  lines.push('', 'Draft the tasks needed to make progress on this goal.');
  return lines.join('\n');
}

/** JSON schema the model's response is constrained to (structured outputs). */
export const PLAN_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
        additionalProperties: false,
      },
    },
  },
  required: ['tasks'],
  additionalProperties: false,
} as const;

/** Pulls the list of raw title candidates out of whatever shape the model returned. */
function extractCandidates(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const tasks = (raw as { tasks?: unknown }).tasks;
    if (Array.isArray(tasks)) return tasks;
  }
  return [];
}

/** Normalizes one candidate (string or {title}) into a clean title, or '' to drop it. */
function normalizeTitle(candidate: unknown): string {
  const raw =
    typeof candidate === 'string'
      ? candidate
      : candidate && typeof candidate === 'object' && typeof (candidate as { title?: unknown }).title === 'string'
        ? (candidate as { title: string }).title
        : '';
  return raw
    .replace(/^\s*(?:\d+[.)]\s*|[-*•]\s*)/, '') // strip any leading "1." / "-" / "*" the model slips in
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
}

/**
 * Cleans the model's proposed tasks: trims each title, drops empties, removes
 * case-insensitive duplicates (keeping the first), and caps the count. Accepts
 * either an array or a `{ tasks: [...] }` object, of strings or `{ title }`.
 */
export function cleanProposedTasks(raw: unknown, opts: { max?: number } = {}): ProposedTask[] {
  const max = Math.max(0, opts.max ?? MAX_PROPOSED_TASKS);
  const seen = new Set<string>();
  const out: ProposedTask[] = [];
  for (const candidate of extractCandidates(raw)) {
    if (out.length >= max) break;
    const title = normalizeTitle(candidate);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title });
  }
  return out;
}
