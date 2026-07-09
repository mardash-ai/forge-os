'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// C19 backfill trigger. POSTs to /api/search/reindex, which (re)indexes the caller's existing
// goals/tasks/projects/areas/habits so rows created before live indexing become searchable.
// Owner-scoping is enforced server-side (the route uses the session owner); this is just the
// button + a small status readout.
type Status = { kind: 'ok'; indexed: number } | { kind: 'error' } | null;

export function ReindexButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function reindex() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/search/reindex', { method: 'POST' });
      if (!res.ok) {
        setStatus({ kind: 'error' });
        return;
      }
      const body = (await res.json()) as { ok?: boolean; indexed?: number };
      if (body.ok) {
        setStatus({ kind: 'ok', indexed: body.indexed ?? 0 });
        router.refresh();
      } else {
        setStatus({ kind: 'error' });
      }
    } catch {
      setStatus({ kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="reindex">
      <button className="btn" onClick={reindex} disabled={busy} title="Index your existing data for search">
        {busy ? 'Reindexing…' : 'Reindex my data'}
      </button>
      {status?.kind === 'ok' ? (
        <span className="reindex-note" role="status">
          Indexed {status.indexed} {status.indexed === 1 ? 'item' : 'items'}.
        </span>
      ) : null}
      {status?.kind === 'error' ? (
        <span className="reindex-note error" role="status">
          Couldn’t reindex — try again.
        </span>
      ) : null}
    </span>
  );
}
