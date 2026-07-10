import Link from 'next/link';

export default function NoteNotFound() {
  return (
    <main className="wrap">
      <header className="masthead">
        <Link className="breadcrumb" href="/notes">
          ← Notes
        </Link>
        <span className="status-line">Resource · Note</span>
      </header>
      <div className="detail-head">
        <h1 className="detail-title">No such note</h1>
        <p className="description">
          This note isn&apos;t here — it may have been removed. Head back to your notes to see
          what&apos;s written.
        </p>
      </div>
    </main>
  );
}
