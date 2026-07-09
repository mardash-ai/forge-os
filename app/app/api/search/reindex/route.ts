import { NextResponse } from 'next/server';
import { collectSearchDocs } from '@/lib/db';
import { reindexDocs } from '@/lib/forge-search';
import { requireOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * C19 backfill — (re)index the CALLER'S existing rows so data created before live indexing is
 * searchable. Owner-scoped end-to-end: `requireOwner()` (behind the middleware gate) yields the
 * verified session userId, `collectSearchDocs` only ever reads that owner's rows, and every
 * document carries that same owner — a caller can never index over another user's data. Powers
 * the "reindex my data" action on /search.
 */
export async function POST() {
  const owner = await requireOwner();
  const docs = await collectSearchDocs(owner);
  const result = await reindexDocs(owner, docs);
  return NextResponse.json(result);
}
