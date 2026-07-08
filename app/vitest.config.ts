import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The prod smoke suite (tests/smoke/**) needs outbound internet and must
    // NEVER run in the hermetic offline unit run. It also isn't a *.test.ts
    // file, but exclude the dir explicitly so it can never be pulled in.
    exclude: [...configDefaults.exclude, 'tests/smoke/**'],
  },
});
