import { describe, it, expect } from 'vitest';
import { healthPayload } from '../lib/health';

describe('healthPayload', () => {
  it('reports ok for the service', () => {
    const p = healthPayload('forge-os', new Date('2026-01-01T00:00:00.000Z'));
    expect(p.status).toBe('ok');
    expect(p.service).toBe('forge-os');
    expect(p.time).toBe('2026-01-01T00:00:00.000Z');
  });
});
