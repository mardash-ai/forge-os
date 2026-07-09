import { describe, it, expect } from 'vitest';
import { APP_VERSION } from '../lib/version';
import pkg from '../package.json';

describe('APP_VERSION', () => {
  it('is read dynamically from package.json (never hardcoded)', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('is a valid SemVer x.y.z string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
