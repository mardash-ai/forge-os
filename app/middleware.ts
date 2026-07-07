// C10 · Identity / Auth — the gate.
//
// Every page and every /api/* route is gated on a valid platform session
// (the `forge_session` HS256 cookie, verified locally — no round-trip), EXCEPT:
//   • /auth/*        the hosted auth surface (login/logout/signup/reset), proxied
//                    same-origin to the platform via the next.config rewrite.
//   • /api/health    public readiness probe (C6) — load balancers hit it unauth.
//   • /api/cron/*    service-scoped: admitted ONLY on a matching service token
//                    (the C2 scheduler attaches it on cron callbacks), never on a
//                    user session.
//
// Unauthenticated → a PAGE redirects (302) to the hosted login with a sanitized
// `next`; an /api/* request gets a 401. This is the whole app's front door.

import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

// Public (no session) and service (token) path prefixes.
const PUBLIC_PREFIXES = ['/auth', '/api/health'];
const SERVICE_PREFIX = '/api/cron';

function isPublic(pathname: string): boolean {
  // Segment-precise: `/auth` and `/auth/…` are public, but `/authors` is NOT.
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// Constant-time string compare (Edge runtime has no crypto.timingSafeEqual).
// Compares over a fixed span so the runtime doesn't leak length/prefix info.
function timingSafeEqual(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ba.length ^ bb.length;
  const len = Math.max(ba.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

// The service token off a cron callback: `X-Forge-Service-Token: <t>` or
// `Authorization: Bearer <t>`.
function serviceTokenFrom(req: NextRequest): string | null {
  const header = req.headers.get('x-forge-service-token');
  if (header) return header;
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  return null;
}

// Reduce an arbitrary `next` to a safe LOCAL path (no open redirect): must be a
// single-slash-rooted path, never protocol-relative (`//host`) or a backslash trick.
function sanitizeNext(pathname: string, search: string): string {
  const candidate = pathname + search;
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/\\')) {
    return '/';
  }
  return candidate;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 1) Hosted auth surface + public probe — always pass through (the rewrite
  //    proxies /auth/*; /api/health answers unauth).
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // 2) Service-scoped cron callbacks — admit ONLY on a matching service token.
  if (pathname === SERVICE_PREFIX || pathname.startsWith(SERVICE_PREFIX + '/')) {
    const expected = process.env.AUTH_SERVICE_TOKEN;
    const presented = serviceTokenFrom(req);
    if (expected && presented && timingSafeEqual(presented, expected)) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 3) Everything else needs a valid user session.
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    return NextResponse.next();
  }

  // Unauthenticated: APIs get a 401; pages redirect to the hosted login.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/auth/login';
  loginUrl.search = '';
  loginUrl.searchParams.set('next', sanitizeNext(pathname, search));
  return NextResponse.redirect(loginUrl, 302);
}

// Match everything except Next internals and common static assets. The prefix
// checks above (not the matcher) decide public/service/gated, so cron + health
// are still seen by the middleware.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf|css|js|map)$).*)'],
};
