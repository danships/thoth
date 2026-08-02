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
    // Second/third seeded members of `SEED.workspace` (THOTH-042, DECISION 4) — `read_write`
    // and `read`-only respectively. Scoped via `testMatch` to only the shared-workspace-access
    // spec, which needs a live browser session for each grant level; every other spec
    // continues to run solely against the primary `chromium` (owner) project.
    {
      name: 'chromium-second-member',
      testMatch: /workspaces\/shared-workspace-access\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/second-user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-readonly-member',
      testMatch: /workspaces\/shared-workspace-access\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/third-user.json',
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
