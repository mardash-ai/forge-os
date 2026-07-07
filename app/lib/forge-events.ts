// Client for the Forge application event log (capability C3). The app emits its OWN
// domain events to Forge and reads them back, replacing the local `events` table.
//
// Best-effort by contract: a failed emit must NEVER break the mutation that triggered
// it, and a failed read degrades to an empty feed — never a crash. The base URL is
// FORGE_EVENTS_URL (dev: the control plane; prod: the data-plane sidecar). The multi-app
// control plane needs the app named (FORGE_APP_NAME); the single-app sidecar infers it,
// so the client only sends `app` when FORGE_APP_NAME is set.

import type { EventData, EventType, TimelineEvent } from './timeline';

/** A platform-stored app event. `type`/`subject` are app-defined; `data` is a denormalized snapshot. */
export interface AppEvent {
  id: string;
  app_id?: string;
  type: string;
  subject?: string | null;
  data?: EventData;
  at: string; // ISO
}

const TIMEOUT_MS = 2_000;

function baseUrl(): string | undefined {
  return process.env.FORGE_EVENTS_URL?.trim() || undefined;
}
function appName(): string | undefined {
  return process.env.FORGE_APP_NAME?.trim() || undefined;
}

/**
 * Emit one domain event (best-effort). Swallows ALL errors and never blocks longer than
 * TIMEOUT_MS, so a slow or absent event log can't break — or stall — the real mutation.
 */
export async function emitAppEvent(input: {
  type: EventType;
  subject?: string | null;
  data?: EventData;
}): Promise<void> {
  const base = baseUrl();
  if (!base) return; // degraded: no event log configured — nothing to do
  const app = appName();
  try {
    await fetch(`${base}/app-events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(app ? { app } : {}),
        type: input.type,
        subject: input.subject ?? undefined,
        data: input.data ?? {},
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // swallow — the activity log is not worth failing (or delaying) a real action over
  }
}

/** Map a platform AppEvent to the app's TimelineEvent shape (subject=goalId, data.taskId=taskId). */
export function toTimelineEvent(e: AppEvent): TimelineEvent {
  const data = e.data ?? {};
  return {
    id: e.id,
    type: e.type as EventType,
    goalId: e.subject ?? null,
    taskId: data.taskId ?? null,
    data,
    createdAt: e.at,
  };
}

/**
 * Recent events newest-first as TimelineEvents, optionally filtered to one goal (subject).
 * Degrades to `[]` on any failure (unset URL, unreachable log, non-2xx, timeout).
 */
export async function listTimelineEvents(opts: { goalId?: string; limit?: number } = {}): Promise<TimelineEvent[]> {
  const base = baseUrl();
  if (!base) return [];
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const params = new URLSearchParams();
  const app = appName();
  if (app) params.set('app', app);
  if (opts.goalId) params.set('subject', opts.goalId);
  params.set('limit', String(limit));
  try {
    const res = await fetch(`${base}/app-events?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { events?: AppEvent[] };
    return (body.events ?? []).map(toTimelineEvent);
  } catch {
    return [];
  }
}

/**
 * Latest activity timestamp per subject (goalId), for cold-goal detection.
 * Degrades to `{}` on any failure.
 */
export async function latestActivityBySubject(): Promise<Record<string, string>> {
  const base = baseUrl();
  if (!base) return {};
  const params = new URLSearchParams();
  const app = appName();
  if (app) params.set('app', app);
  try {
    const res = await fetch(`${base}/app-events/latest?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return {};
    const body = (await res.json()) as { latest?: Record<string, string> };
    return body.latest ?? {};
  } catch {
    return {};
  }
}
