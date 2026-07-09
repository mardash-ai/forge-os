'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Inline edit of a project's title + description (PATCH). Collapsed to a quiet "Edit"
// link until opened, so the detail head stays calm.
export function EditProject({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(title);
  const [d, setD] = useState(description);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setError('');
    setT(title);
    setD(description);
  }

  async function save() {
    if (!t.trim()) {
      setError('A project needs a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, description: d }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not save the project.');
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-ghost edit-project-toggle" onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }

  return (
    <div className="edit-project">
      <input
        className="text-input"
        autoFocus
        value={t}
        placeholder="Project title"
        maxLength={80}
        aria-label="Project title"
        onChange={(e) => {
          setT(e.target.value);
          if (e.target.value.trim()) setError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
      />
      <input
        className="text-input"
        value={d}
        placeholder="A short description (optional)…"
        maxLength={200}
        aria-label="Project description"
        onChange={(e) => setD(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
      />
      <div className="edit-project-actions">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          Save
        </button>
        <button className="btn btn-ghost" onClick={close}>
          Cancel
        </button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
