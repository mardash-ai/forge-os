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
import { clearNotification, listNotifications, upsertNotification } from './forge-notifications';
import type { Notification } from './notifications';

/** Reconcile the platform store with the currently-true conditions and return the live,
 *  non-dismissed inbox, most-urgent first. */
export async function syncNotifications(now: Date): Promise<Notification[]> {
  const derived = await deriveNotifications(now);
  const trueKeys = new Set(derived.map((n) => n.key));

  // What the platform currently holds — so we can clear conditions that no longer apply.
  const stored = await listNotifications({ includeDismissed: true });

  await Promise.all([
    ...derived.map((n) =>
      upsertNotification({
        key: n.key,
        title: n.message,
        subject: n.goalId,
        data: { kind: n.kind, goalId: n.goalId, goalTitle: n.goalTitle, taskId: n.taskId },
      }),
    ),
    ...stored.filter((s) => !trueKeys.has(s.key)).map((s) => clearNotification(s.key)),
  ]);

  // Render from the feed (non-dismissed). The feed is a subset of `derived` after the sync,
  // so filtering `derived` by feed membership keeps the domain's urgency order + grouping
  // while letting the platform own dismissed-state.
  const feedKeys = new Set((await listNotifications()).map((n) => n.key));
  return derived.filter((n) => feedKeys.has(n.key));
}
