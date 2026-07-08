// C10 · Identity / Auth — the gate (now with short-lived access + refresh, P8/P9).
//
// Every page and every /api/* route is gated on a valid platform session
// (the `forge_session` HS256 cookie, verified locally — no round-trip), EXCEPT:
//   • /auth/*        the hosted auth surface (login/logout/signup/reset + refresh),
//                    proxied same-origin to the platform via the next.config rewrite.
//   • /api/health    public readiness probe (C6) — load balancers hit it unauth.
//   • /api/cron/*    service-scoped: admitted ONLY on a matching service token
//                    (the C2 scheduler attaches it on cron callbacks), never on a
//                    user session.
//
// The access cookie `forge_session` is now SHORT-LIVED (~15 min). The browser keeps
// presenting it after `exp` (its Max-Age is still ~30d), which is our REFRESH signal:
// when the access token is absent/expired/invalid but the opaque `forge_refresh`
// cookie is present, we make a server-side, same-origin `POST /auth/refresh`
// (forwarding the incoming request cookies). On 200 the platform rotates BOTH cookies
// — we copy the two Set-Cookie headers onto our response AND reflect them into the
// CURRENT request (so this very request's server components verify the fresh session,
// not the stale one → no bounce, no 500). On 401 the session is truly dead
// (logout / password reset / server-side revocation) — we honor the platform's
// cookie-clear and treat the request as unauthenticated.
//
// Unauthenticated → a PAGE redirects (302) to the hosted login with a sanitized
// `next`; an /api/* request gets a 401. This is the whole app's front door.

import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

// The platform's opaque refresh cookie. NOT a JWS — never parse it for identity;
// we only forward it to /auth/refresh and honor the rotated cookies that come back.
// `Path=/` (set by the platform) is deliberate: the gate runs on every path and
// must see this cookie to decide whether to refresh.
const REFRESH_COOKIE = 'forge_refresh';

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

// The `name=value` of a Set-Cookie header (first segment only, attributes dropped).
function cookiePair(setCookie: string): { name: string; value: string } | null {
  const first = setCookie.split(';', 1)[0];
  const eq = first.indexOf('=');
  if (eq < 0) return null;
  return { name: first.slice(0, eq).trim(), value: first.slice(eq + 1) };
}

// The unauthenticated response for a path: APIs get a 401; pages 302 to the hosted
// login with a sanitized `next`.
function unauthenticated(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/auth/login';
  loginUrl.search = '';
  loginUrl.searchParams.set('next', sanitizeNext(pathname, search));
  return NextResponse.redirect(loginUrl, 302);
}

// Attempt to refresh an absent/expired access token using the opaque refresh cookie.
//   { ok: true, res }   → admit; both cookies rotated on the browser AND this request.
//   { ok: false, clear} → not refreshable; `clear` are the platform's cookie-clear
//                         Set-Cookie headers on a truly-dead session (401), else [].
async function tryRefresh(
  req: NextRequest,
): Promise<{ ok: true; res: NextResponse } | { ok: false; clear: string[] }> {
  // No refresh cookie → nothing to refresh with.
  if (!req.cookies.get(REFRESH_COOKIE)) return { ok: false, clear: [] };

  let resp: Response;
  try {
    // Same-origin so the rotated cookies land on OUR domain; the next.config
    // rewrite proxies /auth/* to the platform. Forward the incoming cookies;
    // never follow redirects (the endpoint answers 200/401 JSON).
    resp = await fetch(new URL('/auth/refresh', req.nextUrl.origin), {
      method: 'POST',
      headers: { cookie: req.headers.get('cookie') ?? '' },
      redirect: 'manual',
    });
  } catch {
    // Network/proxy error → fail closed (treat as unauthenticated).
    return { ok: false, clear: [] };
  }

  const setCookies = resp.headers.getSetCookie();

  if (resp.status !== 200) {
    // Session is truly dead (logout / reset / revoked). Honor the platform's
    // clear of both cookies so the browser stops presenting a dead session.
    return { ok: false, clear: setCookies };
  }

  // Reflect the rotated cookies into THIS request so downstream server components
  // and route handlers (getSession / requireOwner) verify the FRESH access token,
  // not the expired one that triggered the refresh.
  const jar = new Map<string, string>();
  for (const c of req.cookies.getAll()) jar.set(c.name, c.value);
  for (const raw of setCookies) {
    const pair = cookiePair(raw);
    if (pair) jar.set(pair.name, pair.value);
  }
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('cookie', Array.from(jar, ([n, v]) => `${n}=${v}`).join('; '));

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  // Rotate the cookies on the browser too (fresh short-lived access + refresh).
  for (const raw of setCookies) res.headers.append('set-cookie', raw);
  return { ok: true, res };
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Hosted auth surface + public probe — always pass through (the rewrite
  //    proxies /auth/*; /api/health answers unauth). Never refresh on these.
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

  // 3) Fast path: a valid, unexpired access token admits with no round-trip
  //    (unchanged common case).
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    return NextResponse.next();
  }

  // 4) Access absent/expired/invalid: if the opaque refresh cookie is present, try a
  //    same-origin refresh. Success rotates both cookies and admits; a 401 (or no
  //    refresh cookie) is unauthenticated — clear any dead cookies and bounce.
  const refreshed = await tryRefresh(req);
  if (refreshed.ok) {
    return refreshed.res;
  }
  const res = unauthenticated(req);
  for (const c of refreshed.clear) res.headers.append('set-cookie', c);
  return res;
}

// Match everything except Next internals and common static assets. The prefix
// checks above (not the matcher) decide public/service/gated, so cron + health
// are still seen by the middleware.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf|css|js|map)$).*)'],
};
