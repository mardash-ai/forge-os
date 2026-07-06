'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CompleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function complete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${id}/complete`, { method: 'POST' });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn mark" onClick={complete} disabled={busy}>
      Mark complete
    </button>
  );
}
