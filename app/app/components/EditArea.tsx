'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ColorSwatches } from './NewArea';

// Inline manage row for one Area: rename + recolor (PATCH) and delete (DELETE). Collapsed to
// quiet "Edit" / "Delete" affordances until opened, so the areas list stays calm. Deleting an
// Area never deletes the resources tagged to it — they're just untagged (server-side FK).
export function EditArea({
  id,
  name,
  color,
}: {
  id: string;
  name: string;
  color: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(name);
  const [c, setC] = useState(color);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setError('');
    setN(name);
    setC(color);
  }

  async function save() {
    if (!n.trim()) {
      setError('An area needs a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/areas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, color: c }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not save the area.');
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the “${name}” area? Anything filed under it is kept — it just loses the tag.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/areas/${id}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="area-actions">
        <button className="btn btn-ghost area-edit-toggle" onClick={() => setOpen(true)}>
          Edit
        </button>
        <button className="btn btn-ghost area-delete" onClick={remove} disabled={busy}>
          Delete
        </button>
      </div>
    );
  }

  return (
    <div className="edit-area">
      <input
        className="text-input"
        autoFocus
        value={n}
        placeholder="Area name"
        maxLength={60}
        aria-label="Area name"
        onChange={(e) => {
          setN(e.target.value);
          if (e.target.value.trim()) setError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') close();
        }}
      />
      <ColorSwatches value={c} onChange={setC} />
      <div className="edit-area-actions">
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
