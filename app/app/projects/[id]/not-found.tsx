import Link from 'next/link';

export default function ProjectNotFound() {
  return (
    <main className="wrap">
      <header className="masthead">
        <Link className="breadcrumb" href="/projects">
          ← Projects
        </Link>
        <span className="status-line">Resource · Project</span>
      </header>
      <div className="detail-head">
        <h1 className="detail-title">No such project</h1>
        <p className="description">
          This project isn&apos;t here — it may have been removed. Head back to your projects to see
          what&apos;s grouped.
        </p>
      </div>
    </main>
  );
}
