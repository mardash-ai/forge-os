'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// A compact date control on a task row (goal detail). Sets or clears the due date.
export function DueDate({ taskId, dueDate }: { taskId: string; dueDate: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(value: string | null) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: value }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`due-control${dueDate ? ' set' : ''}`}>
      <input
        type="date"
        className="due-input"
        value={dueDate ?? ''}
        disabled={busy}
        aria-label="Due date"
        onChange={(e) => set(e.target.value || null)}
      />
      {dueDate ? (
        <button className="due-clear" onClick={() => set(null)} disabled={busy} aria-label="Clear due date">
          ×
        </button>
      ) : null}
    </span>
  );
}
