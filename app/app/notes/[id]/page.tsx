import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getDocument, listGoalOptions, listProjectOptions } from '@/lib/db';
import { formatBytes, isImageContentType, type DocumentAttachment } from '@/lib/documents';
import { NoteEditor } from '@/app/components/NoteEditor';
import { AttachmentUploader } from '@/app/components/AttachmentUploader';
import { DeleteAttachment } from '@/app/components/DeleteAttachment';
import { DeleteNote } from '@/app/components/DeleteNote';

export const dynamic = 'force-dynamic';

export default async function NotePage({ params }: { params: { id: string } }) {
  const owner = await requireOwner();
  // Owner-scoped: another user's note is absent → notFound() (a 404 page, never a 403).
  const note = await getDocument(owner, params.id);
  if (!note) notFound();
  const [goals, projects] = await Promise.all([listGoalOptions(owner), listProjectOptions(owner)]);

  return (
    <main className="wrap">
      <header className="masthead">
        <Link className="breadcrumb" href="/notes">
          ← Notes
        </Link>
        <span className="status-line">Resource · Note</span>
      </header>

      <div className="note-detail-head">
        <NoteEditor
          id={note.id}
          initialTitle={note.title}
          initialBodyMd={note.bodyMd}
          initialGoalId={note.goalId}
          initialProjectId={note.projectId}
          goals={goals}
          projects={projects}
        />
      </div>

      <section className="attachments">
        <p className="eyebrow section-eyebrow">Attachments</p>
        {note.attachments.length === 0 ? (
          <p className="empty">No files yet. Attach an image or a document below.</p>
        ) : (
          <ul className="attach-list">
            {note.attachments.map((att) => (
              <AttachmentItem key={att.id} documentId={note.id} attachment={att} />
            ))}
          </ul>
        )}
        <AttachmentUploader documentId={note.id} />
      </section>

      <div className="note-footer-actions">
        <DeleteNote id={note.id} title={note.title} />
      </div>
    </main>
  );
}

function AttachmentItem({
  documentId,
  attachment,
}: {
  documentId: string;
  attachment: DocumentAttachment;
}) {
  const src = `/api/blobs/${attachment.blobId}`;
  const isImage = isImageContentType(attachment.contentType);
  return (
    <li className="attach-item">
      {isImage ? (
        <a className="attach-thumb" href={src} target="_blank" rel="noreferrer">
          {/* Streamed from the owner-scoped C20 proxy route — next/image can't optimize an
              app-fronted stream, so a plain img is correct here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={attachment.filename} loading="lazy" />
        </a>
      ) : (
        <span className="attach-icon" aria-hidden="true">
          📄
        </span>
      )}
      <div className="attach-main">
        <a className="attach-name" href={src} target="_blank" rel="noreferrer" download={attachment.filename}>
          {attachment.filename || 'file'}
        </a>
        <span className="attach-meta">
          {attachment.contentType || 'file'} · {formatBytes(attachment.size)}
        </span>
      </div>
      <DeleteAttachment documentId={documentId} attachmentId={attachment.id} filename={attachment.filename} />
    </li>
  );
}
