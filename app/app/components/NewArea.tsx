'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AREA_COLORS } from '@/lib/areas';

// Create an Area (name + optional accent color). Mirrors NewProject's inline reveal, with a
// row of accent swatches instead of a description line — an Area is a lightweight classifier.
export function NewArea() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setError('');
    setName('');
    setColor('');
  }

  async function add() {
    if (!name.trim()) {
      setError('An area needs a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not create the area.');
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
        New area
      </button>
    );
  }

  return (
    <div className="newarea-wrap">
      <div className="newarea">
        <input
          className="text-input"
          autoFocus
          value={name}
          placeholder="Name a life area…"
          maxLength={60}
          aria-label="New area name"
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') close();
          }}
        />
        <ColorSwatches value={color} onChange={setColor} />
        <div className="newarea-actions">
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

/** A row of accent swatches + a "none" chip. Shared by NewArea and EditArea. */
export function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches" role="group" aria-label="Accent color">
      <button
        type="button"
        className={`swatch swatch-none${value === '' ? ' on' : ''}`}
        aria-label="No accent"
        aria-pressed={value === ''}
        onClick={() => onChange('')}
      >
        ○
      </button>
      {AREA_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch${value === c ? ' on' : ''}`}
          style={{ background: c }}
          aria-label={`Accent ${c}`}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}
