'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Cadence } from '@/lib/habits';

export function NewHabit() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [cadence, setCadence] = useState<Cadence>('daily');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function light() {
    if (!title.trim()) {
      setError('A habit needs a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, cadence }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not start the habit.');
        return;
      }
      setTitle('');
      setCadence('daily');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="newhabit-wrap">
      <div className="newhabit">
        <input
          className="text-input"
          value={title}
          placeholder="Start a habit…"
          maxLength={120}
          aria-label="New habit title"
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') light();
          }}
        />
        <div className="cadence-toggle" role="group" aria-label="Cadence">
          {(['daily', 'weekly'] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={`cadence-opt${cadence === c ? ' on' : ''}`}
              aria-pressed={cadence === c}
              onClick={() => setCadence(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={light} disabled={busy}>
          Light it
        </button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
