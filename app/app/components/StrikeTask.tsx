'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// The strike control on the Today board — completes a task in place; on success
// the row leaves the board (the page re-fetches).
export function StrikeTask({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function strike() {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${id}/complete`, { method: 'POST' });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="strike" onClick={strike} disabled={busy} aria-label={`Mark “${title}” complete`}>
      <span aria-hidden="true">✓</span>
    </button>
  );
}
