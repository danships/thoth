// scripts/purge-cli-shared.ts
//
// Shared helpers for the three manual `pnpm {workspaces,pages,files}:purge` CLI wrappers
// (THOTH-063). Each wrapper is a thin adapter over the same bounded `@thoth/database` maintenance
// primitives used by the scheduled `apps/jobs` handlers (`apps/jobs/src/handlers/maintenance/*`)
// — this file owns only the CLI-specific concerns (explicit env reading, database context
// bootstrap, exit-code/summary conventions) so the three callers never duplicate that wiring.
//
// Deliberately does NOT import anything from `apps/web` (its environment validator, its own
// `getDatabase()` singleton, etc.) — a manual command must not implicitly read the whole web
// environment, matching the THOTH-063 spec. It also never calls `runMigrations()`: schema
// sync/migration is exclusively the job of `packages/database/src/cli/migrate.ts`, run once
// before either PM2-managed process starts (see the operations doc,
// `docs/operations/jobs-and-maintenance.md`). Running one of these commands against a database
// that hasn't been migrated yet fails loudly rather than silently targeting an empty schema.
import 'dotenv/config';
import { createDatabaseContext, setDatabaseContext } from '@thoth/database';

const DEFAULT_MAINTENANCE_PURGE_BATCH_SIZE = 100;

/** Thrown by `bootstrapDatabase`/`requireEnvironmentVariable` for a missing required env var. */
export class MissingConfigurationError extends Error {}

function requireEnvironmentVariable(name: string): string {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    throw new MissingConfigurationError(
      `Missing required environment variable: ${name}. Refusing to guess a default database/storage target for a destructive manual command.`
    );
  }
  return raw;
}

function positiveIntEnvironmentVariable(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Bootstraps an isolated `@thoth/database` context from `DB` (the same connection string
 * variable read by both `apps/web` and `apps/jobs`) with `skipSync: true` — this CLI never
 * auto-syncs or migrates. Throws `MissingConfigurationError` if `DB` is unset, rather than
 * silently falling back to a default connection string; `runPurgeCli` maps that to a clear
 * non-zero exit.
 */
export function bootstrapDatabase(): void {
  const connectionString = requireEnvironmentVariable('DB');
  setDatabaseContext(createDatabaseContext({ connectionString, skipSync: true }));
}

export function getMaintenanceBatchSize(): number {
  return positiveIntEnvironmentVariable('MAINTENANCE_PURGE_BATCH_SIZE', DEFAULT_MAINTENANCE_PURGE_BATCH_SIZE);
}

export function getGracePeriodDaysEnvironmentVariable(name: string, fallbackDays: number): number {
  return positiveIntEnvironmentVariable(name, fallbackDays);
}

export function getGracePeriodHoursEnvironmentVariable(name: string, fallbackHours: number): number {
  return positiveIntEnvironmentVariable(name, fallbackHours);
}

/**
 * Runs `run`, printing a human-readable one-line summary on success, or the error and setting a
 * non-zero `process.exitCode` on any thrown/rejected failure — the "clear non-zero exit on fatal
 * failure" contract every purge CLI wrapper shares. Uses `process.exitCode` (not
 * `process.exit()`) so any pending I/O (e.g. the database connection pool) can still flush
 * before the process exits naturally.
 */
export async function runPurgeCli(label: string, run: () => Promise<string>): Promise<void> {
  try {
    const summary = await run();
    console.log(`✅  ${label}: ${summary}`);
  } catch (error) {
    console.error(`❌  ${label} failed:`, error);
    process.exitCode = 1;
  }
}
