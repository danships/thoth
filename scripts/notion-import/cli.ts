#!/usr/bin/env node
// CLI entrypoint: `node notion-import.mjs` (via tsx: `tsx scripts/notion-import/cli.ts`). Loads
// env vars (including a local `.env` via `dotenv`, consistent with the rest of this repo's
// scripts), validates config, takes the state-file lock, runs the import, persists the state
// file, prints a human-readable summary, and exits with the documented status code.

import 'dotenv/config';
import { loadConfig, ConfigError } from './config';
import { loadStateFile, saveStateFile, acquireLock, StateFileCorruptError } from './state-store';
import { NotionClient } from './notion-client';
import { ThothClient } from './thoth-client';
import { runImport, type NotionClientLike } from './index';

function printSummary(result: Awaited<ReturnType<typeof runImport>>) {
  const { state } = result;
  const { stats } = state.lastRun;
  console.log(`\n[notion-import] Run ${state.lastRun.mode} finished: ${state.lastRun.state}`);
  console.log(
    `  created=${stats.created} updated=${stats.updated} skippedUnchanged=${stats.skippedUnchanged} ` +
      `skippedConflict=${stats.skippedConflict} unsupported=${stats.unsupported} failed=${stats.failed}`
  );
  if (state.lastRun.error) {
    console.error(`  error: ${state.lastRun.error}`);
  }
}

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`[notion-import] Configuration error: ${error.message}`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  let releaseLock: (() => Promise<void>) | undefined;
  try {
    releaseLock = await acquireLock(config.stateFilePath);
  } catch (error) {
    console.error(`[notion-import] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }

  try {
    let existingState;
    try {
      existingState = await loadStateFile(config.stateFilePath);
    } catch (error) {
      if (error instanceof StateFileCorruptError) {
        console.error(`[notion-import] ${error.message}`);
        process.exitCode = 2;
        return;
      }
      throw error;
    }

    const notion: NotionClientLike = new NotionClient(config.notionToken);
    const thoth = new ThothClient(config.thothApiUrl, config.thothApiKey);

    const result = await runImport(config, notion, thoth, existingState);
    await saveStateFile(config.stateFilePath, result.state);
    printSummary(result);
    process.exitCode = result.exitCode;
  } finally {
    await releaseLock();
  }
}

try {
  await main();
} catch (error) {
  // Redact potential secrets from an unexpected top-level failure before logging.
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[notion-import] Fatal error: ${message}`);
  process.exitCode = 2;
}
