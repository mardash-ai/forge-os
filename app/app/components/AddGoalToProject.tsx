'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Pick an unaffiliated goal and add it to this project. `addable` is the owner's goals
// that aren't in any project yet (server-provided). Hidden when there are none to add.
export function AddGoalToProject({
  projectId,
  addable,
}: {
  projectId: string;
  addable: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [goalId, setGoalId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (addable.length === 0) {
    return (
      <p className="add-goal-empty">
        No unassigned goals to add. Create a goal on the <a href="/">forge floor</a> first, then add it here.
      </p>
    );
  }

  async function add() {
    if (!goalId) {
      setError('Pick a goal to add.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not add the goal.');
        return;
      }
      setGoalId('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="add-goal-wrap">
      <div className="add-goal">
        <select
          className="goal-select"
          aria-label="Goal to add"
          value={goalId}
          onChange={(e) => {
            setGoalId(e.target.value);
            if (e.target.value) setError('');
          }}
        >
          <option value="">Add a goal to this project…</option>
          {addable.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={add} disabled={busy}>
          Add
        </button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
