'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Remove one attachment from a note: DELETE /api/documents/[id]/attachments/[attachmentId]
// (drops the row + best-effort the platform blob), then refresh.
export function DeleteAttachment({
  documentId,
  attachmentId,
  filename,
}: {
  documentId: string;
  attachmentId: string;
  filename: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/attachments/${attachmentId}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="attach-remove"
      onClick={remove}
      disabled={busy}
      aria-label={`Remove ${filename}`}
      title="Remove attachment"
    >
      ×
    </button>
  );
}
