import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(import.meta.dirname, '.env.test') });

// 'development' (default) runs the Turbopack dev server for local/interactive use.
// 'standalone' runs the pre-built `.next/standalone` production server.js CI downloads once
// from the `ci` job and reuses across every shard (THOTH-064) — see .github/workflows/ci.yaml.
const serverMode = process.env['PLAYWRIGHT_SERVER_MODE'] === 'standalone' ? 'standalone' : 'development';

const webServerCommand =
  serverMode === 'standalone'
    ? { command: 'node server.js', cwd: process.env['PLAYWRIGHT_STANDALONE_DIR'] ?? '.' }
    : { command: 'pnpm dev' };

// Standalone mode runs the production build built by the `ci` job: it must not inherit the dev
// server's `NODE_ENV=test` override, and needs the loopback host/port the artefact was built
// to serve from.
const webServerEnvironment =
  serverMode === 'standalone'
    ? { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: '3000' }
    : { ...process.env, NODE_ENV: 'test' };

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  timeout: 30_000,
  retries: process.env['CI'] ? 2 : 0,
  // Always run with a single worker: all specs share one seeded SQLite database and one
  // auth session, so running them concurrently across multiple workers causes race
  // conditions (e.g. a test that renames a shared seeded page racing with tests reading it).
  // CI sharding (--shard=N/4) gets parallelism across isolated VMs/databases instead.
  workers: 1,
  reporter: process.env['CI']
    ? [['blob', { fileName: process.env['PLAYWRIGHT_BLOB_NAME'] ?? 'report.zip' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
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
    ...webServerCommand,
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    env: webServerEnvironment,
  },
});
