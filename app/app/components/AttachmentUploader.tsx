'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ALLOWED_CONTENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  attachmentRejectionMessage,
  validateAttachment,
} from '@/lib/documents';

// Upload a file to a note (the C20 wiring). Validates size + type client-side first (the route +
// platform validate again), then POSTs the multipart to /api/documents/[id]/attachments, which
// streams it to the platform blob store and records the returned blob_id.
export function AttachmentUploader({ documentId }: { documentId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError('');
    const check = validateAttachment({ contentType: file.type, size: file.size });
    if (!check.ok) {
      setError(attachmentRejectionMessage(check.reason));
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/documents/${documentId}/attachments`, { method: 'POST', body: form });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not attach the file.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not attach the file.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="attach-upload">
      <input
        ref={inputRef}
        type="file"
        className="attach-input"
        accept={ALLOWED_CONTENT_TYPES.join(',')}
        aria-label="Attach a file"
        disabled={busy}
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <button
        className="btn"
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Uploading…' : 'Attach a file'}
      </button>
      <span className="attach-hint">
        Images or docs · up to {Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB
      </span>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
