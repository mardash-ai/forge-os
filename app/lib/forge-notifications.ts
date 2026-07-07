// Client for the Forge notifications store (capability C4). The app owns the DOMAIN —
// WHICH conditions matter (an overdue task, a cold goal) and their copy — and derives the
// currently-true set; the PLATFORM owns storage: idempotent upsert-by-`key` (re-deriving the
// same condition updates in place and PRESERVES `dismissed` + `created_at`, so a still-true,
// already-dismissed notification never resurfaces), dismiss, clear, and the newest-first feed.
// This replaces the old local `dismissed_notifications` table.
//
// Per-user ownership (capability C11): every call carries the caller's opaque `owner`
// (the C10 session `userId`). The platform STAMPS it on write and FILTERS to it on read,
// so one user's inbox never surfaces — or lets them dismiss/clear — another user's alerts.
//
// Best-effort by contract (same shape as the C3 emit): a failed upsert/dismiss/clear must
// NEVER break the read or mutation that triggered it, and a failed feed read degrades to an
// empty inbox — never a crash. Base URL is FORGE_EVENTS_URL (dev: the control plane; prod: the
// data-plane sidecar) — C4's routes live on the same servers as C3. `app` is sent only when
// FORGE_APP_NAME is set (the multi-app control plane needs it; the single-app sidecar infers
// it), exactly like the C3 client.

/** A platform-stored notification. `key` is the app's stable condition id; `data` is a
 *  denormalized snapshot the app round-trips (kind/goalId/goalTitle/taskId). */
export interface PlatformNotification {
  key: string;
  title: string;
  body?: string;
  data: Record<string, unknown>;
  subject?: string | null;
  dismissed: boolean;
  created_at: string; // ISO
  updated_at: string; // ISO
}

const TIMEOUT_MS = 2_000;

function baseUrl(): string | undefined {
  return process.env.FORGE_EVENTS_URL?.trim() || undefined;
}
function appName(): string | undefined {
  return process.env.FORGE_APP_NAME?.trim() || undefined;
}

/** POST a best-effort mutation to a `/notifications*` route. Swallows ALL errors and never
 *  blocks longer than TIMEOUT_MS, so a slow or absent store can't break — or stall — a read. */
async function post(path: string, payload: Record<string, unknown>): Promise<void> {
  const base = baseUrl();
  if (!base) return; // degraded: no store configured — nothing to do
  const app = appName();
  try {
    await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...(app ? { app } : {}), ...payload }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // swallow — a notification write is never worth failing (or delaying) a real action over
  }
}

/** Upsert a currently-true notification (idempotent by `key`; preserves dismissed + created_at). */
export async function upsertNotification(input: {
  owner: string;
  key: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  subject?: string | null;
}): Promise<void> {
  await post('/notifications', {
    owner: input.owner,
    key: input.key,
    title: input.title,
    ...(input.body !== undefined ? { body: input.body } : {}),
    data: input.data ?? {},
    ...(input.subject != null ? { subject: input.subject } : {}),
  });
}

/** Dismiss (persists): hides the notification from the default feed until it's cleared. */
export async function dismissNotification(owner: string, key: string): Promise<void> {
  await post('/notifications/dismiss', { owner, key });
}

/** Clear: the condition no longer applies, so remove the notification entirely. */
export async function clearNotification(owner: string, key: string): Promise<void> {
  await post('/notifications/clear', { owner, key });
}

/**
 * The notification feed, newest-first. By default excludes dismissed; pass
 * `includeDismissed` to get the full store (used to find keys to clear). Degrades to `[]`
 * on any failure (unset URL, unreachable store, non-2xx, timeout) — the inbox never throws.
 */
export async function listNotifications(opts: { owner: string; includeDismissed?: boolean }): Promise<PlatformNotification[]> {
  const base = baseUrl();
  if (!base) return [];
  const params = new URLSearchParams();
  const app = appName();
  if (app) params.set('app', app);
  params.set('owner', opts.owner);
  if (opts.includeDismissed) params.set('include_dismissed', '1');
  try {
    const res = await fetch(`${base}/notifications?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { notifications?: PlatformNotification[] };
    return body.notifications ?? [];
  } catch {
    return [];
  }
}
