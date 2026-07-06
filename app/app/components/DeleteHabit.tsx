'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteHabit({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Remove “${title}” and its streak?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/habits/${id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="habit-remove"
      onClick={remove}
      disabled={busy}
      aria-label={`Remove ${title}`}
      title="Remove habit"
    >
      ×
    </button>
  );
}
