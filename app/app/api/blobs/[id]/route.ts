import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getBlobResponse } from '@/lib/forge-blobs';

// Node runtime: we stream the upstream response body through. force-dynamic — the session gate
// (requireOwner) and the owner-scoped fetch must run on every request.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * C20 · the app-fronted, auth-checked serve proxy. Gate on the session (requireOwner) and stream
 * the blob from the platform `GET /blobs/:id?owner=<session userId>`. The platform is owner-scoped,
 * so a blob owned by ANOTHER user (or a missing one) comes back non-200 → we answer 404 (never a
 * 403), so a cross-owner request can't even confirm the blob exists. Images render inline; docs
 * download (the Content-Disposition the platform sets rides through).
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const owner = await requireOwner();
  const upstream = await getBlobResponse(owner, params.id);
  if (!upstream || !upstream.ok || !upstream.body) {
    // Missing OR cross-owner OR store unreachable — all a 404 to the caller.
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const headers = new Headers();
  const passthrough = ['content-type', 'content-length', 'content-disposition', 'etag', 'last-modified'];
  for (const name of passthrough) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Owner-scoped bytes — keep them out of shared caches.
  headers.set('cache-control', 'private, max-age=300');

  return new NextResponse(upstream.body, { status: 200, headers });
}
