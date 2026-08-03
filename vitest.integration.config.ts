import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/integration/api/**/*.test.ts'],
    exclude: ['src/**'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ['tests/integration/global-setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@lib': path.resolve(import.meta.dirname, 'src/lib'),
      '@components': path.resolve(import.meta.dirname, 'src/lib/components'),
      '@types': path.resolve(import.meta.dirname, 'src/lib/types'),
    },
  },
});
