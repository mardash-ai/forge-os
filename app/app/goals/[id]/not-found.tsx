import Link from 'next/link';

export default function GoalNotFound() {
  return (
    <main className="wrap">
      <header className="masthead">
        <Link className="breadcrumb" href="/">
          ← The forge floor
        </Link>
        <span className="status-line">Resource · Goal</span>
      </header>
      <div className="detail-head">
        <h1 className="detail-title">No such goal</h1>
        <p className="description">
          This goal isn&apos;t on the anvil — it may have been removed. Head back to the forge floor
          to see what&apos;s hot.
        </p>
      </div>
    </main>
  );
}
