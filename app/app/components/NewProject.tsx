'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Create a Project (title + optional description). Mirrors NewGoal's inline reveal, with
// a second line for the description since a Project frames a body of work.
export function NewProject() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setError('');
    setTitle('');
    setDescription('');
  }

  async function add() {
    if (!title.trim()) {
      setError('A project needs a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not create the project.');
        return;
      }
      close();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        New project
      </button>
    );
  }

  return (
    <div className="newproject-wrap">
      <div className="newproject">
        <input
          className="text-input"
          autoFocus
          value={title}
          placeholder="Name a project…"
          maxLength={80}
          aria-label="New project title"
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') close();
          }}
        />
        <input
          className="text-input"
          value={description}
          placeholder="A short description (optional)…"
          maxLength={200}
          aria-label="New project description"
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') close();
          }}
        />
        <div className="newproject-actions">
          <button className="btn btn-primary" onClick={add} disabled={busy}>
            Add
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
