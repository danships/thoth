import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['tests/**'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    isolate: true,
    fileParallelism: true,
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
