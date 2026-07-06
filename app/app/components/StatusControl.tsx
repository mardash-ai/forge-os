'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GOAL_STATUSES, type GoalStatus } from '@/lib/goals';

const LABELS: Record<GoalStatus, string> = {
  active: 'Active',
  achieved: 'Achieved',
  archived: 'Archived',
};

export function StatusControl({ id, status }: { id: string; status: GoalStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(next: GoalStatus) {
    if (next === status || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="status-control" role="group" aria-label="Goal status">
      {GOAL_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          className={`seg${s === status ? ' on' : ''}`}
          aria-pressed={s === status}
          disabled={busy}
          onClick={() => set(s)}
        >
          {LABELS[s]}
        </button>
      ))}
    </div>
  );
}
