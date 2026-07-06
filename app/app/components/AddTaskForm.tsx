'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AddTaskForm({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim()) {
      setError('A task needs a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/goals/${goalId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not add the task.');
        return;
      }
      setTitle('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="addtask-wrap">
      <div className="addtask">
        <input
          className="text-input"
          value={title}
          placeholder="Add a task…"
          maxLength={120}
          aria-label="New task title"
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        <button className="btn btn-primary" onClick={add} disabled={busy}>
          Add task
        </button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
