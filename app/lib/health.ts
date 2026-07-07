// Standard health/telemetry contract (platform capability C6).
//
// The PLATFORM owns the shape + rollup + HTTP-code convention; the APP supplies
// the service name and a list of opaque check thunks. WHICH checks mean "ready"
// is the app's domain decision (see app/api/health/route.ts); how a failure maps
// to a status/code is the platform contract enforced here.
//
// Contract:
//   body   = { status, service, time (ISO), checks: [{ name, status, detail? }] }
//   status = 'ok' | 'degraded' | 'unavailable'
//   check  = 'ok' | 'unavailable'
//   rollup = any REQUIRED check unavailable -> 'unavailable' (HTTP 503)
//            else any check unavailable      -> 'degraded'    (HTTP 200, flagged)
//            else                            -> 'ok'          (HTTP 200)
//   checks: [] means liveness-only (always ok/200).

export type HealthStatus = 'ok' | 'degraded' | 'unavailable';
export type CheckStatus = 'ok' | 'unavailable';

export interface HealthCheckResult {
  name: string;
  status: CheckStatus;
  detail?: string;
}

export interface HealthBody {
  status: HealthStatus;
  service: string;
  time: string;
  checks: HealthCheckResult[];
}

export interface HealthCheck {
  name: string;
  // Return/resolve normally => ok. Throw/reject => unavailable, and the error
  // message becomes `detail`. The thunk is opaque to the platform contract.
  check: () => Promise<void> | void;
  // A failing REQUIRED check makes the whole service `unavailable` (503).
  // A failing non-required check only DEGRADES it (200, flagged). Default: true.
  required?: boolean;
}

export interface HealthResult {
  body: HealthBody;
  httpStatus: number;
}

/**
 * Run every check, aggregate to the standard schema, and pick the HTTP status
 * per the readiness convention. Checks run concurrently; output order matches
 * input order. Never throws — a thrown check becomes an `unavailable` entry.
 */
export async function buildHealth(
  service: string,
  checks: HealthCheck[],
  now: Date = new Date(),
): Promise<HealthResult> {
  const results = await Promise.all(
    checks.map(async (c): Promise<{ result: HealthCheckResult; requiredDown: boolean }> => {
      try {
        await c.check();
        return { result: { name: c.name, status: 'ok' }, requiredDown: false };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        const required = c.required ?? true;
        return { result: { name: c.name, status: 'unavailable', detail }, requiredDown: required };
      }
    }),
  );

  const anyRequiredDown = results.some((r) => r.requiredDown);
  const anyDown = results.some((r) => r.result.status === 'unavailable');
  const status: HealthStatus = anyRequiredDown ? 'unavailable' : anyDown ? 'degraded' : 'ok';

  return {
    body: { status, service, time: now.toISOString(), checks: results.map((r) => r.result) },
    httpStatus: status === 'unavailable' ? 503 : 200,
  };
}
