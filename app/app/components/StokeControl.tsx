'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// The per-period check-in control: "Stoke" when the current period is still
// pending, or a quiet "Kept lit · Undo" once it's done.
export function StokeControl({ id, done }: { id: string; done: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function send(method: 'POST' | 'DELETE') {
    setBusy(true);
    try {
      await fetch(`/api/habits/${id}/checkin`, { method });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="stoke-done">
        <span className="kept-lit" aria-label="Kept lit this period">
          Kept lit
        </span>
        <button className="btn btn-ghost undo" onClick={() => send('DELETE')} disabled={busy}>
          Undo
        </button>
      </div>
    );
  }
  return (
    <button className="btn stoke-btn" onClick={() => send('POST')} disabled={busy}>
      Stoke
    </button>
  );
}
