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

/** Reconcile the platform store with the currently-true conditions and return the live,
 *  non-dismissed inbox, most-urgent first. */
export async function syncNotifications(now: Date): Promise<Notification[]> {
  const derived: Notification[] = await deriveNotifications(now);
  const trueKeys = new Set(derived.map((n: Notification) => n.key));

  // Snapshot the store BEFORE writing, to find conditions that no longer apply.
  const stored: PlatformNotification[] = await listNotifications({ includeDismissed: true });

  // Reconcile SEQUENTIALLY — do NOT fire these concurrently. The platform store applies each
  // upsert/clear as a read-modify-write of the whole per-app list, so concurrent mutations
  // (even to different keys) lose updates and the feed comes back flickering/partial. One
  // write at a time keeps the store consistent. (A future C2 job could move this off the read
  // path entirely.)
  for (const n of derived) {
    await upsertNotification({
      key: n.key,
      title: n.message,
      subject: n.goalId,
      data: { kind: n.kind, goalId: n.goalId, goalTitle: n.goalTitle, taskId: n.taskId },
    });
  }
  for (const s of stored) {
    if (!trueKeys.has(s.key)) await clearNotification(s.key);
  }

  // Render from the feed (non-dismissed). The feed is a subset of `derived` after the sync,
  // so filtering `derived` by feed membership keeps the domain's urgency order + grouping
  // while letting the platform own dismissed-state.
  const feed: PlatformNotification[] = await listNotifications();
  const feedKeys = new Set(feed.map((n: PlatformNotification) => n.key));
  return derived.filter((n: Notification) => feedKeys.has(n.key));
}
