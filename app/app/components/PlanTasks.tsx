'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Proposal {
  title: string;
  selected: boolean;
}

interface Notice {
  text: string;
  tone: 'info' | 'error';
}

interface PlanResponse {
  tasks?: { title?: unknown }[];
  error?: string;
}

// The Planner control on a goal: draft tasks with AI, then review them as cold
// "sketches" and accept the ones worth keeping. Accepting reuses normal task
// creation, so accepted sketches become real Tasks (Timeline + progress).
export function PlanTasks({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [drafting, setDrafting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);

  const selectedCount = proposals.reduce((n, p) => (p.selected ? n + 1 : n), 0);

  async function draft() {
    setDrafting(true);
    setOpen(false);
    setNotice(null);
    setProposals([]);
    try {
      const res = await fetch(`/api/goals/${goalId}/plan`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as PlanResponse;
      if (!res.ok) {
        // 503 (no key) is expected guidance; anything else is a real failure.
        setNotice({
          text: data.error ?? "The Planner couldn't draft tasks just now. Try again.",
          tone: res.status === 503 ? 'info' : 'error',
        });
        setOpen(true);
        return;
      }
      const tasks = (data.tasks ?? [])
        .map((t) => (typeof t.title === 'string' ? t.title : ''))
        .filter((title) => title.length > 0)
        .map((title) => ({ title, selected: true }));
      if (tasks.length === 0) {
        setNotice({
          text: "The Planner didn't find anything to add. Add a task yourself, or try a fuller goal description.",
          tone: 'info',
        });
      }
      setProposals(tasks);
      setOpen(true);
    } catch {
      setNotice({ text: "The Planner couldn't draft tasks just now. Try again.", tone: 'error' });
      setOpen(true);
    } finally {
      setDrafting(false);
    }
  }

  function toggle(index: number) {
    setProposals((prev) => prev.map((p, i) => (i === index ? { ...p, selected: !p.selected } : p)));
  }

  async function accept() {
    const chosen = proposals.filter((p) => p.selected);
    if (chosen.length === 0) return;
    setAdding(true);
    try {
      // Sequential so the Timeline records the tasks in the drafted order.
      for (const p of chosen) {
        await fetch(`/api/goals/${goalId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: p.title }),
        });
      }
      dismiss();
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  function dismiss() {
    setOpen(false);
    setProposals([]);
    setNotice(null);
  }

  return (
    <div className="plan">
      <button className="btn plan-btn" onClick={draft} disabled={drafting}>
        <span className="plan-spark" aria-hidden="true">
          ✦
        </span>
        {drafting ? 'Drafting…' : 'Draft tasks with AI'}
      </button>

      {open ? (
        <div className="plan-panel" role="group" aria-label="Tasks drafted by the Planner">
          <p className="plan-eyebrow">
            Planner{proposals.length > 0 ? ` · Drafted ${proposals.length}` : ''}
          </p>

          {proposals.length > 0 ? (
            <>
              <ul className="plan-rows">
                {proposals.map((p, i) => (
                  <li key={i} className={`plan-row${p.selected ? ' picked' : ''}`}>
                    <label className="plan-check">
                      <input type="checkbox" checked={p.selected} onChange={() => toggle(i)} />
                      <span className="plan-row-title">{p.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="plan-actions">
                <button
                  className="btn btn-primary"
                  onClick={accept}
                  disabled={adding || selectedCount === 0}
                >
                  {adding ? 'Adding…' : `Add ${selectedCount} task${selectedCount === 1 ? '' : 's'}`}
                </button>
                <button className="btn btn-ghost" onClick={dismiss} disabled={adding}>
                  Dismiss
                </button>
              </div>
            </>
          ) : (
            <>
              {notice ? <p className={`plan-notice ${notice.tone}`}>{notice.text}</p> : null}
              <div className="plan-actions">
                <button className="btn btn-ghost" onClick={dismiss}>
                  Dismiss
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
