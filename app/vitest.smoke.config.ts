import { defineConfig } from 'vitest/config';

// Production smoke suite (host-run, needs OUTBOUND INTERNET) — deliberately kept
// OUT of the hermetic offline unit run (`./forge test`, `vitest.config.ts`).
// Run with: `npm run smoke:prod` (or point SMOKE_URL/BASE_URL at dev/staging).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/smoke/**/*.smoke.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
