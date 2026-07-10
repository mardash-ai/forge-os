'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Markdown } from './Markdown';

type Option = { id: string; title: string };

// The note editor: title + a markdown body with a LIVE rendered preview beside it, plus optional
// Goal / Project links. Saves via PATCH /api/documents/[id]. The preview renders through the same
// XSS-safe <Markdown> the detail view uses, so what you write is what you get.
export function NoteEditor({
  id,
  initialTitle,
  initialBodyMd,
  initialGoalId,
  initialProjectId,
  goals,
  projects,
}: {
  id: string;
  initialTitle: string;
  initialBodyMd: string;
  initialGoalId: string | null;
  initialProjectId: string | null;
  goals: Option[];
  projects: Option[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [bodyMd, setBodyMd] = useState(initialBodyMd);
  const [goalId, setGoalId] = useState(initialGoalId ?? '');
  const [projectId, setProjectId] = useState(initialProjectId ?? '');
  const [saved, setSaved] = useState({
    title: initialTitle,
    bodyMd: initialBodyMd,
    goalId: initialGoalId ?? '',
    projectId: initialProjectId ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(false);

  const dirty =
    title !== saved.title || bodyMd !== saved.bodyMd || goalId !== saved.goalId || projectId !== saved.projectId;

  async function save() {
    if (!title.trim()) {
      setError('A note needs a title.');
      return;
    }
    setBusy(true);
    setError('');
    setFlash(false);
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          bodyMd,
          goalId: goalId || null,
          projectId: projectId || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not save the note.');
        return;
      }
      setSaved({ title, bodyMd, goalId, projectId });
      setFlash(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="note-editor">
      <div className="note-editor-head">
        <input
          className="text-input note-title-input"
          value={title}
          placeholder="Note title"
          maxLength={140}
          aria-label="Note title"
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) setError('');
          }}
        />
        <div className="note-editor-save">
          {flash && !dirty ? <span className="note-saved" role="status">Saved</span> : null}
          <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="note-links">
        <label className="note-link">
          <span className="note-link-label">Goal</span>
          <select
            className="area-select"
            value={goalId}
            aria-label="Link to a goal"
            onChange={(e) => setGoalId(e.target.value)}
          >
            <option value="">— none —</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <label className="note-link">
          <span className="note-link-label">Project</span>
          <select
            className="area-select"
            value={projectId}
            aria-label="Link to a project"
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">— none —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="note-editor-panes">
        <div className="note-pane">
          <p className="note-pane-label">Write · Markdown</p>
          <textarea
            className="note-textarea"
            value={bodyMd}
            placeholder={'Write in **markdown**…\n\n- a list\n- [a link](https://example.com)\n\n> a quote'}
            aria-label="Note body (markdown)"
            spellCheck
            onChange={(e) => setBodyMd(e.target.value)}
          />
        </div>
        <div className="note-pane">
          <p className="note-pane-label">Preview</p>
          <div className="note-preview">
            <Markdown source={bodyMd} />
          </div>
        </div>
      </div>

      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
