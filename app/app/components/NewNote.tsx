'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Create a note from the /notes list — title only, then jump straight into the editor at
// /notes/[id] (where the body + attachments live). Mirrors NewProject's inline reveal.
export function NewNote() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setError('');
    setTitle('');
  }

  async function create() {
    if (!title.trim()) {
      setError('A note needs a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not create the note.');
        return;
      }
      const doc = (await res.json()) as { id: string };
      router.push(`/notes/${doc.id}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        New note
      </button>
    );
  }

  return (
    <div className="newnote-wrap">
      <div className="newnote">
        <input
          className="text-input"
          autoFocus
          value={title}
          placeholder="Name a note…"
          maxLength={140}
          aria-label="New note title"
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create();
            if (e.key === 'Escape') close();
          }}
        />
        <div className="newnote-actions">
          <button className="btn btn-primary" onClick={create} disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
