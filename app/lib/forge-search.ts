// Client for the Forge search index (capability C19). The app INDEXES its own domain
// rows (goals, tasks, projects, areas, habits) into the platform and SEARCHES them back —
// full-text ranking, snippets, and owner-scoping all live on the platform.
//
// Per-user ownership (capability C11): every call carries the caller's opaque `owner`
// (the C10 session `userId`). The platform STAMPS it on write and FILTERS to it on read,
// so a search only ever returns the caller's OWN documents — one user can never surface,
// or index over, another user's data.
//
// Two error postures, matching how each call is triggered:
//   • WRITES (index / delete / reindex-on-mutation) are BEST-EFFORT — a failed index write
//     must NEVER break (or stall) the mutation that triggered it. Swallow all errors, cap the
//     wait at TIMEOUT_MS. Mirrors the C3 emit / C4 upsert contract.
//   • SEARCH is USER-INVOKED — on any failure it DEGRADES to an empty result flagged
//     `degraded`, so the page can show a soft "search unavailable" notice instead of a 500.
//
// Base URL is FORGE_EVENTS_URL (dev: the control plane; prod: the data-plane sidecar) — the
// C19 routes live on the same servers as C3/C4. `app` is sent only when FORGE_APP_NAME is set
// (the multi-app control plane needs it; the single-app sidecar infers it), exactly like the
// C3/C4 clients.

const TIMEOUT_MS = 2_000;

/** The domain kinds we index. `type` is app-defined; the platform treats it opaquely. */
export type SearchType = 'goal' | 'task' | 'project' | 'area' | 'habit';

/** A document to upsert into the index. Idempotent by `(owner, type, id)`. */
export interface IndexDoc {
  owner: string;
  type: SearchType;
  id: string;
  title: string;
  body?: string;
  tags?: string[];
  attrs?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

/** One ranked search hit. `snippet` may contain `<mark>…</mark>` around the matched terms. */
export interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  snippet: string;
  score: number;
  attrs?: Record<string, unknown>;
  created_at?: string;
}

/** A search result. `degraded` is true when the platform was unreachable and we fell back to
 *  an empty set — the UI shows a soft "search unavailable" notice rather than pretending
 *  there were zero matches. */
export interface SearchResult {
  hits: SearchHit[];
  total: number;
  took_ms: number;
  degraded: boolean;
}

export interface SearchQuery {
  owner: string;
  q: string;
  types?: SearchType[];
  limit?: number;
  offset?: number;
  date_from?: string;
  date_to?: string;
}

/** Outcome of a bulk backfill. `ok` reflects whether the platform accepted the batch. */
export interface ReindexResult {
  ok: boolean;
  indexed: number;
}

function baseUrl(): string | undefined {
  return process.env.FORGE_EVENTS_URL?.trim() || undefined;
}
function appName(): string | undefined {
  return process.env.FORGE_APP_NAME?.trim() || undefined;
}

/** POST a BEST-EFFORT write to a `/index*` / `/reindex` route. Swallows ALL errors and never
 *  blocks longer than TIMEOUT_MS, so a slow or absent index can't break — or stall — a real
 *  mutation. Returns whether the platform accepted it (callers that care, e.g. reindex, read
 *  it; the fire-and-forget index/delete paths ignore it). */
async function post(path: string, payload: Record<string, unknown>): Promise<boolean> {
  const base = baseUrl();
  if (!base) return false; // degraded: no index configured — nothing to do
  const app = appName();
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...(app ? { app } : {}), ...payload }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    // swallow — an index write is never worth failing (or delaying) a real action over
    return false;
  }
}

/**
 * Upsert one document into the index (best-effort, idempotent by `(owner, type, id)`).
 * Called at the same points the app emits its C3 domain events; a failure is swallowed so
 * the triggering mutation is never affected.
 */
export async function indexDoc(doc: IndexDoc): Promise<void> {
  await post('/index', {
    owner: doc.owner,
    type: doc.type,
    id: doc.id,
    title: doc.title,
    ...(doc.body !== undefined ? { body: doc.body } : {}),
    ...(doc.tags !== undefined ? { tags: doc.tags } : {}),
    ...(doc.attrs !== undefined ? { attrs: doc.attrs } : {}),
    ...(doc.created_at !== undefined ? { created_at: doc.created_at } : {}),
    ...(doc.updated_at !== undefined ? { updated_at: doc.updated_at } : {}),
  });
}

/** Remove one document from the index (best-effort) — called when a row is hard-deleted. */
export async function deleteDoc(input: { owner: string; type: SearchType; id: string }): Promise<void> {
  await post('/index/delete', { owner: input.owner, type: input.type, id: input.id });
}

/**
 * Bulk backfill: (re)index a batch of the owner's existing documents so rows that predate
 * live indexing become searchable. Best-effort on the wire but returns a real outcome so the
 * "reindex my data" action can report success/failure. An empty batch is a no-op success.
 */
export async function reindexDocs(owner: string, documents: IndexDoc[]): Promise<ReindexResult> {
  if (documents.length === 0) return { ok: true, indexed: 0 };
  const ok = await post('/reindex', { owner, documents });
  return { ok, indexed: ok ? documents.length : 0 };
}

/**
 * Search the caller's OWN documents. On success returns the platform's ranked hits; on ANY
 * failure (unset URL, unreachable index, non-2xx, timeout, bad JSON) DEGRADES to an empty,
 * `degraded: true` result — the search box shows a soft "unavailable" notice, never a 500.
 */
export async function search(query: SearchQuery): Promise<SearchResult> {
  const empty = (degraded: boolean): SearchResult => ({ hits: [], total: 0, took_ms: 0, degraded });
  const base = baseUrl();
  if (!base) return empty(true);
  const app = appName();
  const limit = query.limit !== undefined ? Math.min(Math.max(query.limit, 1), 100) : undefined;
  try {
    const res = await fetch(`${base}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        ...(app ? { app } : {}),
        owner: query.owner,
        q: query.q,
        ...(query.types && query.types.length ? { types: query.types } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(query.offset !== undefined ? { offset: query.offset } : {}),
        ...(query.date_from ? { date_from: query.date_from } : {}),
        ...(query.date_to ? { date_to: query.date_to } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return empty(true);
    const body = (await res.json()) as { hits?: SearchHit[]; total?: number; took_ms?: number };
    return {
      hits: body.hits ?? [],
      total: body.total ?? (body.hits ? body.hits.length : 0),
      took_ms: body.took_ms ?? 0,
      degraded: false,
    };
  } catch {
    return empty(true);
  }
}

// ---- pure helpers (no I/O — directly unit-testable, shared by the /search UI) ----

/** Human label for a hit's type, e.g. `goal` → "Goal". */
export function typeLabel(type: SearchType): string {
  switch (type) {
    case 'goal':
      return 'Goal';
    case 'task':
      return 'Task';
    case 'project':
      return 'Project';
    case 'area':
      return 'Area';
    case 'habit':
      return 'Habit';
  }
}

/** Where a hit links in the app. Tasks route to their goal's page (attrs.goalId); areas and
 *  habits have no detail page, so they route to their list surface. A hit missing the id it
 *  needs falls back to the floor. */
export function hitHref(hit: Pick<SearchHit, 'type' | 'id' | 'attrs'>): string {
  switch (hit.type) {
    case 'goal':
      return `/goals/${hit.id}`;
    case 'task': {
      const goalId = hit.attrs?.goalId;
      return typeof goalId === 'string' && goalId ? `/goals/${goalId}` : '/';
    }
    case 'project':
      return `/projects/${hit.id}`;
    case 'area':
      return '/areas';
    case 'habit':
      return '/habits';
  }
}

/** A parsed snippet segment: a run of text, flagged whether it was inside `<mark>…</mark>`. */
export interface SnippetSegment {
  text: string;
  mark: boolean;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITIES[m] ?? m);
}

/**
 * Parse a platform snippet into plain-text/marked segments. The snippet wraps matched terms
 * in `<mark>…</mark>`; the surrounding text is HTML-escaped. We split ONLY on the `<mark>`
 * boundaries and return the inner text decoded — the UI renders each segment as a React text
 * node (or a real `<mark>`), so NO platform HTML is ever injected. This keeps highlighting
 * XSS-safe even though the underlying titles/bodies are user-provided.
 */
export function parseSnippet(snippet: string): SnippetSegment[] {
  const parts = snippet.split(/(<mark>|<\/mark>)/);
  const out: SnippetSegment[] = [];
  let marked = false;
  for (const part of parts) {
    if (part === '<mark>') {
      marked = true;
      continue;
    }
    if (part === '</mark>') {
      marked = false;
      continue;
    }
    if (part === '') continue;
    out.push({ text: decodeEntities(part), mark: marked });
  }
  return out;
}
