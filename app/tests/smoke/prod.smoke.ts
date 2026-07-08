import { describe, it, expect, beforeAll } from 'vitest';

/**
 * PRODUCTION SMOKE SUITE — strictly NON-DESTRUCTIVE, read-only.
 *
 * Validates the *deployed* app over HTTP. This suite is intentionally excluded
 * from the hermetic offline unit run (`./forge test`) — it needs outbound
 * internet. Run it with `npm run smoke:prod` (host-run vitest against a live
 * deployment). Target host comes from `SMOKE_URL` (fallback `BASE_URL`),
 * defaulting to prod, so the same suite can be pointed at dev/staging.
 *
 * SAFETY: every request is a safe GET plus one cookie-less POST /auth/refresh
 * that returns 401 with no side effect. No signups, no writes, no emails, no
 * DB/volume ops. Node's `fetch` sends no cookies (no jar), and every request
 * uses `redirect: 'manual'` so we observe gate redirects instead of following
 * them. Safe to run against prod repeatedly.
 */

// Pick the first env value that is an absolute http(s) URL. We require the
// scheme deliberately: Vite/Vitest injects `process.env.BASE_URL = '/'`, which
// would otherwise clobber the fallback — a bare '/' is not a valid target.
function pickTarget(...candidates: (string | undefined)[]): string {
  for (const v of candidates) {
    if (v && /^https?:\/\//i.test(v)) return v;
  }
  return 'https://forge-os.mardash.ai';
}

const BASE = pickTarget(process.env.SMOKE_URL, process.env.BASE_URL).replace(/\/+$/, '');

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const HEALTH_STATUSES = ['ok', 'degraded', 'unavailable'];
const CHECK_STATUSES = ['ok', 'unavailable'];
// Conservative superset of status-banner states; prod is currently 'operational'.
const KNOWN_OVERALL = ['operational', 'degraded', 'maintenance', 'partial_outage', 'major_outage', 'down'];

/** Fresh, cookie-less request that never follows redirects. */
function req(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, { redirect: 'manual', ...init });
}

beforeAll(() => {
  // eslint-disable-next-line no-console
  console.log(`[prod.smoke] target = ${BASE}`);
});

describe(`forge-os production smoke (${BASE})`, () => {
  it('1. GET /api/health → 200 public, matches the C6 schema', async () => {
    const res = await req('/api/health');
    expect(res.status).toBe(200); // public: not a redirect, not 401
    const body = await res.json();
    expect(HEALTH_STATUSES).toContain(body.status);
    expect(body.service).toBe('forge-os');
    expect(typeof body.time).toBe('string');
    expect(body.time).toMatch(ISO);
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    expect(Array.isArray(body.checks)).toBe(true);
    for (const c of body.checks) {
      expect(typeof c.name).toBe('string');
      expect(CHECK_STATUSES).toContain(c.status);
    }
  });

  it('2. GET / (no cookies) → 302 to the login gate', async () => {
    const res = await req('/');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/auth/login?next=%2F');
  });

  it('3. GET /auth/config → 200 with the intended prod auth config', async () => {
    const res = await req('/auth/config');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured.email).toBe(true);
    expect(body.configured.google).toBe(true);
    expect(body.configured.session_key).toBe(true);
    expect(body.configured.service_token).toBe(true);
    expect(body.methods.password_signup).toBe(true);
    expect(body.methods.google).toBe(true);
  });

  it('4. GET /auth/login → 200 text/html with both auth methods', async () => {
    const res = await req('/auth/login');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') || '').toContain('text/html');
    const html = await res.text();
    // email + password method
    expect(html).toMatch(/<input[^>]*type="email"|<input[^>]*name="email"/i);
    expect(html).toMatch(/<input[^>]*type="password"|<input[^>]*name="password"/i);
    // Google method
    expect(html).toMatch(/href="\/auth\/google/i);
    expect(html).toMatch(/Continue with Google/i);
  });

  it('5. domain API is session-gated → 401 without a session', async () => {
    const goals = await req('/api/goals');
    expect(goals.status).toBe(401);
    const today = await req('/api/today');
    expect(today.status).toBe(401);
  });

  it('6. GET /api/cron/habits-finalize → 403 without a service token (not 401)', async () => {
    const res = await req('/api/cron/habits-finalize');
    expect(res.status).toBe(403);
  });

  it('7. POST /auth/refresh (no cookie) → 401, no side effect', async () => {
    const res = await req('/auth/refresh', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('8. GET /status → 200 public and /status.json reports a valid banner + db component', async () => {
    const page = await req('/status');
    expect(page.status).toBe(200); // public: no login redirect

    const res = await req('/status.json');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(KNOWN_OVERALL).toContain(body.overall);
    expect(Array.isArray(body.components)).toBe(true);
    const db = body.components.find((c: { name: string }) => c.name.toLowerCase().includes('db'));
    expect(db, 'expected a "db" component in /status.json').toBeTruthy();
  });
});
