// Shown (via Suspense) while the server runs the C19 search on navigation to /search — so a
// slower query reads as "searching", not a frozen page. Deliberately static + lightweight.
export default function SearchLoading() {
  return (
    <main className="wrap">
      <header className="masthead">
        <span className="wordmark">
          Forge<b>·</b>OS
        </span>
      </header>
      <div className="floor-head">
        <div className="head-text">
          <p className="eyebrow">Find anything</p>
          <h1>Search</h1>
        </div>
      </div>
      <p className="search-note" role="status">
        Searching…
      </p>
    </main>
  );
}
