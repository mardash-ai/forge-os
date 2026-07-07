// The notification inbox, reconciled against the platform store (capability C4).
//
// On each derive (read-time now; a C2 job could drive this later) we:
//   1. compute the currently-true domain notifications (overdue tasks, cold goals) — the
//      app owns WHICH conditions matter and the copy;
//   2. UPSERT every true condition (idempotent by key — the platform preserves `dismissed`
//      + `created_at`, so a still-true, already-dismissed alert never resurfaces) and CLEAR
//      any stored key whose condition no longer holds;
//   3. render from the FEED: the platform's non-dismissed set is the source of membership,
//      the domain supplies order + copy + grouping.
//
// Fully degraded (event server/sidecar unreachable): the client swallows the writes and the
// feed reads `[]`, so the inbox is empty and nothing throws — same contract as C3.

import { deriveNotifications } from './db';
import {
  clearNotification,
  listNotifications,
  upsertNotification,
  type PlatformNotification,
} from './forge-notifications';
import type { Notification } from './notifications';

/** Reconcile the OWNER's platform store with their currently-true conditions and return their
 *  live, non-dismissed inbox, most-urgent first. Every derive/store call is scoped to `owner`
 *  (C11), so a user only ever reconciles and sees their own alerts. */
export async function syncNotifications(owner: string, now: Date): Promise<Notification[]> {
  const derived: Notification[] = await deriveNotifications(owner, now);
  const trueKeys = new Set(derived.map((n: Notification) => n.key));

  // Snapshot the store BEFORE writing, to find conditions that no longer apply.
  const stored: PlatformNotification[] = await listNotifications({ owner, includeDismissed: true });

  // Reconcile CONCURRENTLY — the platform store is now atomic under concurrent writes (per-app
  // mutex + atomic file replace, C4/P5), so all upserts + clears can fire in parallel without
  // losing updates. The feed stays deterministic. (A future C2 job could move this off the read
  // path entirely.)
  await Promise.all([
    ...derived.map((n: Notification) =>
      upsertNotification({
        owner,
        key: n.key,
        title: n.message,
        subject: n.goalId,
        data: { kind: n.kind, goalId: n.goalId, goalTitle: n.goalTitle, taskId: n.taskId },
      }),
    ),
    ...stored
      .filter((s: PlatformNotification) => !trueKeys.has(s.key))
      .map((s: PlatformNotification) => clearNotification(owner, s.key)),
  ]);

  // Render from the feed (non-dismissed). The feed is a subset of `derived` after the sync,
  // so filtering `derived` by feed membership keeps the domain's urgency order + grouping
  // while letting the platform own dismissed-state.
  const feed: PlatformNotification[] = await listNotifications({ owner });
  const feedKeys = new Set(feed.map((n: PlatformNotification) => n.key));
  return derived.filter((n: Notification) => feedKeys.has(n.key));
}
