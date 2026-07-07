// Client for the Forge agent runtime (capability C1). The app asks the platform to run a
// STRUCTURED agent task — a system prompt + input constrained to a JSON Schema — and gets back
// a parsed, schema-valid artifact. This replaces the local @anthropic-ai/sdk call, the
// `agent_runs` table, and `recordAgentRun()`: the PLATFORM now owns the model call, structured
// output enforcement, and durable run history (AgentRunSucceeded/AgentRunFailed facts + an
// Artifact); the app keeps only the DOMAIN — the Planner's prompt, the tasks JSON Schema, and
// the `cleanProposedTasks` post-validation of whatever the model returns.
//
// Base URL is FORGE_EVENTS_URL (dev: the control plane; prod: the data-plane sidecar) — the
// same base wired for C3/C4. `app` is sent only when FORGE_APP_NAME is set (the multi-app
// control plane needs it; the single-app sidecar infers it), exactly like the C3/C4 clients.
// The model key reuses the C5 secret ANTHROPIC_API_KEY from Forge's vault; the app never sees it.
//
// Per-user ownership (capability C11): the request carries the caller's opaque `owner` (the
// C10 session `userId`), so the platform stamps the persisted run with it and a user's run
// history filters to their own.
//
// UNLIKE the C3/C4 clients this is NOT best-effort — the caller needs the result — so it
// distinguishes two failure shapes for the route:
//   - the dependency is UNAVAILABLE: no base URL configured, or the platform answers
//     `503 dependency_unavailable` (e.g. the model key is unconfigured). No run is persisted;
//     the route degrades to a 503 and the app stays up. Signalled by AgentRunUnavailableError.
//   - the run itself FAILED durably (HTTP 200 but `resource.status === 'failed'`), or any other
//     non-2xx / malformed response: a plain Error the route maps to a 502. NB: a model-run
//     failure arrives as 200 + status:"failed" — check the RESOURCE, not the HTTP code.

/** The Agent Task resource the platform returns. On success `artifact` is the parsed,
 *  schema-valid structured result (also durably stored as an Artifact at `artifact_id`). */
export interface AgentTask {
  id: string;
  status: 'succeeded' | 'failed';
  model: string;
  artifact?: unknown;
  artifact_id?: string;
  error?: string | null;
}

/** Thrown when the agent runtime / its model dependency is unavailable (no run persisted).
 *  The route maps this to a 503 so the app degrades gracefully instead of crashing. */
export class AgentRunUnavailableError extends Error {
  constructor(message = 'The agent runtime is unavailable') {
    super(message);
    this.name = 'AgentRunUnavailableError';
  }
}

// Model runs are slow — give the request real headroom (well above the 2s used for the
// fire-and-forget C3/C4 writes) so a normal draft isn't aborted mid-flight.
const TIMEOUT_MS = 60_000;

function baseUrl(): string | undefined {
  return process.env.FORGE_EVENTS_URL?.trim() || undefined;
}
function appName(): string | undefined {
  return process.env.FORGE_APP_NAME?.trim() || undefined;
}

export interface AgentRunRequest {
  /** The caller's opaque owner (C10 session `userId`). C11: the platform stamps the run
   *  with it so a user's durable run history filters to just their own runs. */
  owner: string;
  /** Free-form label for the run (e.g. 'planner'); surfaces in `forge inspect agent-runs`. */
  capability: string;
  system: string;
  input: string;
  /** JSON Schema (top-level object). Structured output is enforced against it by the platform. */
  schema: object;
  model?: string;
  maxTokens?: number;
}

/**
 * Run a structured agent task and return its succeeded AgentTask (`artifact` = the parsed,
 * schema-valid result). Throws {@link AgentRunUnavailableError} when the runtime/model key is
 * not configured (→ route 503, nothing persisted); throws a plain Error when the run failed
 * durably or the response was malformed/otherwise non-2xx (→ route 502).
 */
export async function runAgentTask(req: AgentRunRequest): Promise<AgentTask> {
  const base = baseUrl();
  if (!base) throw new AgentRunUnavailableError('FORGE_EVENTS_URL is not configured');
  const app = appName();

  let res: Response;
  try {
    res = await fetch(`${base}/capabilities/agent-run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(app ? { app } : {}),
        owner: req.owner,
        capability: req.capability,
        system: req.system,
        input: req.input,
        schema: req.schema,
        ...(req.model ? { model: req.model } : {}),
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // The runtime couldn't be reached at all (network/timeout) — treat as a run failure (502),
    // not a config gate: the URL was set, so this is transient rather than "unconfigured".
    throw new Error(`agent-run request failed: ${err instanceof Error ? err.message : 'network error'}`);
  }

  // Absent/unconfigured model key → durable dependency_unavailable; NO run persisted.
  if (res.status === 503) {
    throw new AgentRunUnavailableError('The agent runtime reported its model dependency is unavailable');
  }
  if (!res.ok) {
    throw new Error(`agent-run returned HTTP ${res.status}`);
  }

  let body: { resource?: AgentTask };
  try {
    body = (await res.json()) as { resource?: AgentTask };
  } catch {
    throw new Error('agent-run returned a malformed response');
  }
  const task = body.resource;
  if (!task || (task.status !== 'succeeded' && task.status !== 'failed')) {
    throw new Error('agent-run returned no task resource');
  }
  // A model-run failure is DURABLE and arrives as 200 + status:"failed" — surface it as a 502.
  if (task.status === 'failed') {
    throw new Error(task.error || 'the agent run failed');
  }
  return task;
}
