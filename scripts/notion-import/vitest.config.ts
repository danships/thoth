import { defineConfig } from 'vitest/config';

// Standalone Vitest config for the notion-import script. Deliberately does not extend or import
// anything from the root Thoth project's `vitest.unit.config.ts` — this package is tested and
// run in isolation, with its own dependencies (see `package.json`).
export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    isolate: true,
    fileParallelism: true,
  },
});
