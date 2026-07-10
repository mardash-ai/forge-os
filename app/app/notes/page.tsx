import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { listDocuments } from '@/lib/db';
import { plainExcerpt, type DocumentSummary } from '@/lib/documents';
import { SiteNav } from '@/app/components/SiteNav';
import { NewNote } from '@/app/components/NewNote';

export const dynamic = 'force-dynamic';

// B1 · Notes / Documents — the "second brain" surface, and the first consumer of the platform
// blob store (C20, via attachments on the detail page). Owner-scoped: requireOwner (behind the
// middleware gate) yields the session userId; listDocuments only ever returns that owner's notes.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function updatedLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default async function NotesPage() {
  const owner = await requireOwner();
  const notes = await listDocuments(owner);

  return (
    <main className="wrap">
      <header className="masthead">
        <span className="wordmark">
          Forge<b>·</b>OS
        </span>
        <SiteNav current="notes" />
      </header>

      <div className="floor-head">
        <div className="head-text">
          <p className="eyebrow">The second brain</p>
          <h1>Notes</h1>
          <p className="floor-status">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'} · markdown, with file attachments
          </p>
        </div>
        <div className="head-actions">
          <NewNote />
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="empty">
          No notes yet. Write one to capture a thought, a doc, or a reference — attach images and
          files, and link it to a goal or project.
        </p>
      ) : (
        <ul className="doc-list">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} updatedLabel={updatedLabel(note.updatedAt)} />
          ))}
        </ul>
      )}
    </main>
  );
}

function NoteCard({ note, updatedLabel }: { note: DocumentSummary; updatedLabel: string }) {
  const excerpt = plainExcerpt(note.bodyMd);
  return (
    <li className="doc-card">
      <Link className="doc-card-link" href={`/notes/${note.id}`}>
        <div className="doc-card-top">
          <h2 className="doc-card-title">{note.title}</h2>
          <span className="doc-card-updated">{updatedLabel}</span>
        </div>
        {excerpt ? <p className="doc-card-excerpt">{excerpt}</p> : null}
        <div className="doc-card-meta">
          {note.attachmentCount > 0 ? (
            <span className="doc-meta-chip">
              📎 {note.attachmentCount} {note.attachmentCount === 1 ? 'file' : 'files'}
            </span>
          ) : null}
          {note.goalTitle ? <span className="doc-meta-chip">Goal · {note.goalTitle}</span> : null}
          {note.projectTitle ? <span className="doc-meta-chip">Project · {note.projectTitle}</span> : null}
        </div>
      </Link>
    </li>
  );
}
