import { describe, test, expect } from 'vitest';
import path from 'node:path';

/**
 * Static assertions over the root `pm2.config.js` (THOTH-060). Verifies the two-process,
 * single-instance-fork-mode shape the ticket requires without needing a running PM2/Docker
 * environment: exactly `thoth-jobs` + `thoth-web`, both fork mode with `instances: 1` (never
 * cluster — the queue and the web/session/SQLite topology are both single-process), jobs waits
 * for an explicit `ready` signal with a safe `kill_timeout` longer than the jobs shutdown
 * timeout default, and both carry production-only environment.
 */
async function loadConfig() {
  const configPath = path.resolve(import.meta.dirname, '../../../../../pm2.config.js');
  const imported = (await import(configPath)) as { default: { apps: Record<string, unknown>[] } };
  return imported.default;
}

describe('pm2.config.js', () => {
  test('declares exactly two apps: thoth-jobs and thoth-web', async () => {
    const config = await loadConfig();
    const names = config.apps.map((app) => app['name']);
    expect(names).toEqual(['thoth-jobs', 'thoth-web']);
  });

  test('both apps run a single fork-mode instance, never cluster mode', async () => {
    const config = await loadConfig();
    for (const app of config.apps) {
      expect(app['exec_mode']).toBe('fork');
      expect(app['instances']).toBe(1);
    }
  });

  test('thoth-jobs waits for an explicit ready signal with a safe kill_timeout', async () => {
    const config = await loadConfig();
    const jobs = config.apps.find((app) => app['name'] === 'thoth-jobs') as {
      wait_ready: boolean;
      kill_timeout: number;
      script: string;
    };
    expect(jobs.wait_ready).toBe(true);
    // Longer than `JOB_SHUTDOWN_TIMEOUT_MS`'s default (10_000ms, see apps/jobs/src/environment.ts)
    // so PM2 gives the jobs process enough time to drain claims/close its socket before SIGKILL.
    expect(jobs.kill_timeout).toBeGreaterThan(10_000);
    expect(jobs.script).toContain(path.join('apps', 'jobs', 'dist', 'index.js'));
  });

  test('thoth-web points at the verified Next standalone server path', async () => {
    const config = await loadConfig();
    const web = config.apps.find((app) => app['name'] === 'thoth-web') as { script: string };
    expect(web.script).toContain(path.join('apps', 'web', 'server.js'));
  });

  test('both apps set NODE_ENV=production', async () => {
    const config = await loadConfig();
    for (const app of config.apps) {
      const environment = app['env'] as Record<string, string>;
      expect(environment['NODE_ENV']).toBe('production');
    }
  });

  test('both apps enable autorestart with a bounded restart policy', async () => {
    const config = await loadConfig();
    for (const app of config.apps) {
      expect(app['autorestart']).toBe(true);
      expect(typeof app['max_restarts']).toBe('number');
      expect(app['max_restarts']).toBeGreaterThan(0);
    }
  });
});
