#!/usr/bin/env tsx
/**
 * Hermetic, non-interactive Playwright launcher (THOTH-064).
 *
 * Every invocation gets its own SQLite database file and upload folder inside a freshly
 * `mkdtemp`-created directory, so repeated/interrupted local runs — and independent CI shards —
 * never share database state. `test-results/`, `playwright-report/`, and `tests/e2e/.auth/`
 * are diagnostic outputs and are intentionally left in the repository working tree.
 *
 * Usage: `tsx scripts/run-end-to-end-tests.ts [-- ...playwright args]` — every CLI argument is
 * forwarded unchanged to `pnpm exec playwright test`, e.g.:
 *   pnpm test:e2e -- tests/e2e/pages/page-detail.spec.ts:96
 *   pnpm test:e2e -- --shard=2/4
 */
import { spawn, type ChildProcess } from 'node:child_process';
import dotenv from 'dotenv';
import path from 'node:path';
import {
  buildEphemeralEnvironment,
  buildPlaywrightArguments,
  createTemporaryStateDirectory,
  removeTemporaryStateDirectory,
} from './lib/run-end-to-end-test-helpers';

dotenv.config({ path: path.resolve(import.meta.dirname, '..', '.env.test') });

async function runHermeticPlaywright(): Promise<number> {
  const temporaryDirectory = createTemporaryStateDirectory();
  let childExitCode = 1;

  try {
    const environment = buildEphemeralEnvironment(process.env, temporaryDirectory);
    const forwardedArguments = process.argv.slice(2);
    const child: ChildProcess = spawn('pnpm', buildPlaywrightArguments(forwardedArguments), {
      stdio: 'inherit',
      env: environment as NodeJS.ProcessEnv,
    });

    // Forward interrupt/terminate signals to the child so an interrupted UI/debug run doesn't
    // leave Playwright's `webServer` process running after this launcher exits.
    const forwardSignal = (signal: NodeJS.Signals) => {
      child.kill(signal);
    };
    process.on('SIGINT', forwardSignal);
    process.on('SIGTERM', forwardSignal);

    childExitCode = await new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      // A null `code` means the child was terminated by a signal; treat that as a failure.
      child.on('exit', (code: number | null) => {
        resolve(code ?? 1);
      });
    });

    process.off('SIGINT', forwardSignal);
    process.off('SIGTERM', forwardSignal);
  } finally {
    // Playwright and its webServer have exited by this point; safe to remove the temp state.
    removeTemporaryStateDirectory(temporaryDirectory);
  }

  return childExitCode;
}

try {
  process.exitCode = await runHermeticPlaywright();
} catch (error: unknown) {
  console.error('[run-end-to-end-tests] failed:', error);
  process.exitCode = 1;
}
