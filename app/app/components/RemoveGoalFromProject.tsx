'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Remove a goal from this project — nulls the FK; the goal itself is untouched.
export function RemoveGoalFromProject({
  projectId,
  goalId,
  title,
}: {
  projectId: string;
  goalId: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/goals/${goalId}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="goal-remove"
      onClick={remove}
      disabled={busy}
      aria-label={`Remove ${title} from this project`}
      title="Remove from project"
    >
      ×
    </button>
  );
}
