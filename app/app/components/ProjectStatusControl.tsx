'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PROJECT_STATUSES, type ProjectStatus } from '@/lib/projects';

const LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  archived: 'Archived',
};

// Segmented Active/Archived toggle — the same control shape as a goal's status. Archiving
// detaches (does NOT delete) member goals server-side, so a refresh re-reads the empty roll.
export function ProjectStatusControl({ id, status }: { id: string; status: ProjectStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(next: ProjectStatus) {
    if (next === status || busy) return;
    if (next === 'archived' && !window.confirm('Archive this project? Its goals are kept — they just leave the project.')) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
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
    <div className="status-control" role="group" aria-label="Project status">
      {PROJECT_STATUSES.map((s) => (
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
