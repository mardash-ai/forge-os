'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DismissButton({ notificationKey }: { notificationKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function dismiss() {
    setBusy(true);
    try {
      const res = await fetch('/api/notifications/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: notificationKey }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="dismiss" onClick={dismiss} disabled={busy}>
      Dismiss
    </button>
  );
}
