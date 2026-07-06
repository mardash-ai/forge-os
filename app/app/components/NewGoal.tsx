'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function NewGoal() {
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

  async function add() {
    if (!title.trim()) {
      setError('A goal needs a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not create the goal.');
        return;
      }
      setTitle('');
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        New goal
      </button>
    );
  }

  return (
    <div className="newgoal-wrap">
      <div className="newgoal">
        <input
          className="text-input"
          autoFocus
          value={title}
          placeholder="Name a goal to start working it…"
          maxLength={80}
          aria-label="New goal title"
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') close();
          }}
        />
        <button className="btn btn-primary" onClick={add} disabled={busy}>
          Add
        </button>
        <button className="btn btn-ghost" onClick={close}>
          Cancel
        </button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
