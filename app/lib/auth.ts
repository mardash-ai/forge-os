// C10 · Identity / Auth — the app's thin adapter over the platform's HOSTED auth.
//
// forge-os owns NO auth UI and NO auth tables. The platform (a Forge data-plane
// in prod; the same image as a dev sidecar) issues the session as a compact
// HS256 JWS in the `forge_session` cookie; here we only VERIFY it locally — no
// round-trip — to gate requests. Sign-in/up/reset all live on the hosted
// `/auth/*` surface, reached same-origin through the rewrite in next.config.mjs.
//
// Session contract (from the platform):
//   cookie   forge_session
//   payload  { userId, email, sessionId, iat, exp }   (HS256 JWS)
//   key      HMAC-SHA256 over the RAW bytes of AUTH_SESSION_SECRET
//
// This module is import-safe in the Edge runtime (middleware): the verify path
// depends only on `jose` (Web Crypto). The server-only helpers reach for
// next/headers + next/navigation via dynamic import so they never pull
// server-only modules into the middleware bundle.

import { jwtVerify } from 'jose';

/** Name of the platform-issued session cookie. */
export const SESSION_COOKIE = 'forge_session';

/** The identity we gate on. `userId` is also the per-user OWNER (capability C11):
 *  every app-domain row and every platform-store record (C1/C3/C4) is stamped with
 *  and filtered to it, so users are fully isolated. */
export type Session = { userId: string; email: string };

function sessionKey(): Uint8Array | null {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) return null;
  // The platform signs with the raw secret STRING bytes (verified empirically),
  // so we key HMAC the same way.
  return new TextEncoder().encode(secret);
}

/**
 * Verify a `forge_session` token locally and return the identity, or null.
 *
 * Returns null on: no token, no configured secret, bad signature, wrong alg, or
 * an expired/`exp`-passed token (jwtVerify enforces `exp`). Fail closed. Safe to
 * call from the Edge runtime (middleware), route handlers, and server components.
 */
export async function verifySessionToken(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const key = sessionKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    const { userId, email } = payload as Record<string, unknown>;
    if (typeof userId !== 'string' || typeof email !== 'string') return null;
    return { userId, email };
  } catch {
    // Bad signature, expired, malformed — all mean "not authenticated".
    return null;
  }
}

/**
 * The current session in a server component or route handler, or null.
 * (Middleware reads the cookie off the request and calls verifySessionToken
 * directly — it must not import next/headers.)
 */
export async function getSession(): Promise<Session | null> {
  const { cookies } = await import('next/headers');
  return verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
}

/**
 * Like getSession, but redirects to the hosted login when unauthenticated.
 * Belt-and-suspenders behind the middleware gate for server components / route
 * handlers that want the identity to be present.
 */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (session) return session;
  const { redirect } = await import('next/navigation');
  // redirect() throws (returns `never`) — returning it keeps this typed as Session.
  return redirect('/auth/login');
}

/**
 * The current user's OWNER id (capability C11) — the value we stamp on / filter every
 * app-domain row and platform-store call by. The middleware gate guarantees a valid
 * session on every non-public page and /api/* route, so in practice this always resolves;
 * it still FAILS CLOSED (throws) if ever reached without one, so a coding slip can never
 * silently run an owner-less (cross-user) query. Callers in a page/route already sit behind
 * that gate — use this to obtain the owner to pass into the db + client layers.
 */
export async function requireOwner(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error('requireOwner: no session on a gated request');
  return session.userId;
}
