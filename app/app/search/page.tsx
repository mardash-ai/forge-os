import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import {
  hitHref,
  parseSnippet,
  search,
  typeLabel,
  type SearchHit,
  type SearchType,
} from '@/lib/forge-search';
import { SiteNav } from '@/app/components/SiteNav';
import { ReindexButton } from '@/app/components/ReindexButton';

export const dynamic = 'force-dynamic';

// C19 · Global Search. One box across the whole floor: goals, tasks, projects, areas, habits.
// Server-rendered — a plain GET form navigates here with `?q=…` and the owner comes straight
// from the session (requireOwner, behind the middleware gate), so a caller only ever searches
// their OWN data (the platform enforces owner-scoping; we pass the verified userId). Results are
// ranked, typed, and link back to each resource; the platform's <mark> snippets are rendered as
// safe React text nodes (never raw HTML). Degrades to a soft notice if the index is unreachable.

const TYPE_OPTIONS: { value: SearchType; label: string }[] = [
  { value: 'goal', label: 'Goals' },
  { value: 'project', label: 'Projects' },
  { value: 'task', label: 'Tasks' },
  { value: 'note', label: 'Notes' },
  { value: 'area', label: 'Areas' },
  { value: 'habit', label: 'Habits' },
];

function asSearchType(value: string | undefined): SearchType | undefined {
  return TYPE_OPTIONS.some((o) => o.value === value) ? (value as SearchType) : undefined;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: { q?: string; type?: string };
}) {
  const owner = await requireOwner();
  const q = (searchParams?.q ?? '').trim();
  const type = asSearchType(searchParams?.type);

  const result = q
    ? await search({ owner, q, types: type ? [type] : undefined, limit: 50 })
    : null;

  return (
    <main className="wrap">
      <header className="masthead">
        <span className="wordmark">
          Forge<b>·</b>OS
        </span>
        <SiteNav current="search" />
      </header>

      <div className="floor-head">
        <div className="head-text">
          <p className="eyebrow">Find anything</p>
          <h1>Search</h1>
          <p className="floor-status">
            One box across goals, tasks, projects, areas &amp; habits.
          </p>
        </div>
        <div className="head-actions">
          <ReindexButton />
        </div>
      </div>

      <form className="search-form" method="get" action="/search" role="search">
        <input
          className="text-input"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search your goals, tasks, projects…"
          aria-label="Search query"
          autoFocus
        />
        <select className="search-select" name="type" defaultValue={type ?? ''} aria-label="Filter by type">
          <option value="">All types</option>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit">
          Search
        </button>
      </form>

      <SearchBody q={q} result={result} />
    </main>
  );
}

function SearchBody({
  q,
  result,
}: {
  q: string;
  result: Awaited<ReturnType<typeof search>> | null;
}) {
  // Empty query — invite a search rather than showing an empty list.
  if (!q || !result) {
    return (
      <p className="empty">
        Type a word or two above to search everything you&apos;ve forged. New goals, tasks,
        projects, areas, and habits are indexed as you create them.
      </p>
    );
  }

  // The index was unreachable — degrade softly, never a 500 or a false "no results".
  if (result.degraded) {
    return (
      <p className="search-note" role="status">
        Search is temporarily unavailable. Your data is safe — try again in a moment.
      </p>
    );
  }

  if (result.hits.length === 0) {
    return (
      <p className="empty">
        No matches for “{q}”. Try a different word, or broaden the type filter to “All types”.
      </p>
    );
  }

  return (
    <>
      <p className="search-count">
        {result.total} {result.total === 1 ? 'match' : 'matches'} for “{q}”
        {result.took_ms ? <span className="search-took"> · {result.took_ms} ms</span> : null}
      </p>
      <ul className="results">
        {result.hits.map((hit) => (
          <ResultCard key={`${hit.type}:${hit.id}`} hit={hit} />
        ))}
      </ul>
    </>
  );
}

function ResultCard({ hit }: { hit: SearchHit }) {
  const segments = hit.snippet ? parseSnippet(hit.snippet) : [];
  return (
    <li className="result">
      <Link className="result-link" href={hitHref(hit)}>
        <div className="result-top">
          <span className="result-type">{typeLabel(hit.type)}</span>
          <h2 className="result-title">{hit.title}</h2>
        </div>
        {segments.length > 0 ? (
          <p className="result-snippet">
            {segments.map((seg, i) =>
              seg.mark ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>,
            )}
          </p>
        ) : null}
      </Link>
    </li>
  );
}
