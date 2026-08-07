import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(import.meta.dirname, '.env.test') });

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  timeout: 30_000,
  retries: process.env['CI'] ? 2 : 0,
  // Always run with a single worker: all specs share one seeded SQLite database and one
  // auth session, so running them concurrently across multiple workers causes race
  // conditions (e.g. a test that renames a shared seeded page racing with tests reading it).
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    env: { NODE_ENV: 'test' },
  },
});
