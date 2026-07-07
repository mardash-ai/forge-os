import { describe, it, expect } from 'vitest';
import { buildHealth } from '../lib/health';

const ok = () => {};
const fail = (msg: string) => () => {
  throw new Error(msg);
};

describe('buildHealth (standard health contract — C6)', () => {
  it('reports ok / 200 when every check passes', async () => {
    const { body, httpStatus } = await buildHealth(
      'forge-os',
      [{ name: 'db', check: ok }],
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(body.status).toBe('ok');
    expect(body.service).toBe('forge-os');
    expect(body.time).toBe('2026-01-01T00:00:00.000Z');
    expect(body.checks).toEqual([{ name: 'db', status: 'ok' }]);
    expect(httpStatus).toBe(200);
  });

  it('reports unavailable / 503 when a required check fails', async () => {
    const { body, httpStatus } = await buildHealth('forge-os', [
      { name: 'db', check: fail('ECONNREFUSED') },
    ]);
    expect(body.status).toBe('unavailable');
    expect(httpStatus).toBe(503);
    expect(body.checks).toEqual([{ name: 'db', status: 'unavailable', detail: 'ECONNREFUSED' }]);
  });

  it('only degrades (200) when a NON-required check fails', async () => {
    const { body, httpStatus } = await buildHealth('forge-os', [
      { name: 'db', check: ok },
      { name: 'cache', check: fail('miss'), required: false },
    ]);
    expect(body.status).toBe('degraded');
    expect(httpStatus).toBe(200);
    expect(body.checks[1]).toEqual({ name: 'cache', status: 'unavailable', detail: 'miss' });
  });

  it('is liveness-only (ok / 200) with an empty checks list', async () => {
    const { body, httpStatus } = await buildHealth('forge-os', []);
    expect(body.status).toBe('ok');
    expect(body.checks).toEqual([]);
    expect(httpStatus).toBe(200);
  });
});
