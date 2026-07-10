'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Delete a whole note (and its attachments, via cascade + best-effort blob cleanup). A two-tap
// confirm so it isn't a single misclick; on success, return to the notes list.
export function DeleteNote({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/notes');
        router.refresh();
      } else {
        setBusy(false);
        setConfirming(false);
      }
    } catch {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button className="btn btn-ghost note-delete" onClick={() => setConfirming(true)}>
        Delete
      </button>
    );
  }

  return (
    <span className="note-delete-confirm">
      <span className="note-delete-ask">Delete “{title}”?</span>
      <button className="btn note-delete-yes" onClick={remove} disabled={busy}>
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      <button className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
        Keep
      </button>
    </span>
  );
}
