import { cleanEnv, makeValidator, str, bool, EnvError } from 'envalid';

/**
 * Environment validation for `@thoth/jobs` (THOTH-059, extended THOTH-061).
 *
 * Deliberately does NOT import `apps/web`'s environment validator: the jobs process must be
 * able to boot without any Next.js/web dependency. Since THOTH-061 it does require its own `DB`
 * connection string (see below) to resolve/dispatch/deliver webhooks — job *scheduling* state
 * itself still lives entirely in memory (see the package README / THOTH-059 spec).
 */

// envalid's built-in `num()` validator (parseFloat under the hood) accepts zero, negative,
// fractional, and infinite values. Timing/concurrency/retention settings must be finite
// positive integers — Node runs zero/negative timer delays at ~1ms, `Infinity` removes the
// concurrency bound entirely, and fractional values produce an unintended effective limit.
const positiveInt = makeValidator<number>((input) => {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new EnvError(`Expected a finite positive integer, got: "${input}"`);
  }
  return parsed;
});

const environmentSchema = {
  NODE_ENV: str({ choices: ['development', 'production', 'test'] }),
  LOG_LEVEL: str({
    choices: ['error', 'warn', 'info', 'http', 'debug', 'trace'],
    default: 'info',
  }),
  // SuperSave connection string (THOTH-061) — the jobs process now reads/writes application
  // data directly (webhooks, deliveries, pages, apps, ...) to resolve and deliver webhook
  // dispatch/redeliver jobs. Always opened with `skipSync: true` (see `apps/jobs/src/index.ts`)
  // — schema sync/migrations remain the exclusive job of `packages/database/src/cli/migrate.ts`,
  // run once before either PM2-managed process starts.
  DB: str(),
  // Absolute path to the Unix domain socket the worker listens on. When set, must be absolute;
  // otherwise a per-UID private temp directory is used as a convenience default in any environment.
  JOB_SOCKET_PATH: str({ default: undefined }),
  // How often the runner polls for due jobs when it hasn't been woken by an enqueue/retry.
  JOB_POLL_INTERVAL_MS: positiveInt({ default: 1000 }),
  // How long the process waits for active handlers to finish/abort on SIGTERM/SIGINT before exiting.
  JOB_SHUTDOWN_TIMEOUT_MS: positiveInt({ default: 10_000 }),
  // Maximum number of jobs the runner executes concurrently.
  JOB_CONCURRENCY: positiveInt({ default: 4 }),
  // How long terminal (completed/dead) job records are retained in memory before the retention
  // sweep evicts them. Pure memory hygiene — never durability.
  JOB_RETENTION_MS: positiveInt({ default: 15 * 60 * 1000 }),
  // Maximum number of terminal job records retained in memory regardless of age.
  JOB_RETENTION_MAX: positiveInt({ default: 500 }),
  // How often the scheduler ticks to ensure the current interval bucket has been enqueued.
  JOB_SCHEDULER_TICK_MS: positiveInt({ default: 5000 }),
  // Per-attempt abort timeout for outbound webhook delivery fetches (THOTH-061). Overridable
  // (only) so the integration test harness can shrink an otherwise-real network timeout against
  // an intentionally unreachable test URL, without changing production behaviour.
  WEBHOOK_DELIVERY_TIMEOUT_MS: positiveInt({ default: 5000 }),
  // Base delay (ms) for the full-jitter exponential backoff between webhook delivery attempts
  // (THOTH-061). Overridable for the same reason as `WEBHOOK_DELIVERY_TIMEOUT_MS` above.
  WEBHOOK_DELIVERY_BACKOFF_BASE_MS: positiveInt({ default: 500 }),
  // Storage backend for the `maintenance.purge-files` handler (THOTH-063) — read here, and only
  // here, mirroring `apps/web`'s own `STORAGE_TYPE`/`STORAGE_LOCAL_FOLDER`. Both processes must
  // agree on these values in any real deployment (same backend, same folder) since they operate
  // on the same `uploaded-file` rows/bytes.
  STORAGE_TYPE: str({ choices: ['local'], default: 'local' }),
  STORAGE_LOCAL_FOLDER: str({ default: 'data/uploads' }),
  // Grace periods (THOTH-063) — must match `apps/web`'s `WORKSPACE_DELETE_GRACE_PERIOD_DAYS`/
  // `PAGE_DELETE_GRACE_PERIOD_DAYS`/`FILES_PURGE_GRACE_PERIOD_HOURS` in any real deployment,
  // since both processes reason about the same soft-deleted/orphaned rows.
  WORKSPACE_DELETE_GRACE_PERIOD_DAYS: positiveInt({ default: 30 }),
  PAGE_DELETE_GRACE_PERIOD_DAYS: positiveInt({ default: 30 }),
  FILES_PURGE_GRACE_PERIOD_HOURS: positiveInt({ default: 24 }),
  // Bounded batch size per maintenance purge execution (THOTH-063) — keeps one bounded pass's
  // read/delete volume (and therefore lease/heartbeat time) small regardless of total estate
  // size; a continuation picks up where a batch left off via its `offset` payload field.
  MAINTENANCE_PURGE_BATCH_SIZE: positiveInt({ default: 100 }),
  // Terminal job-record retention (THOTH-063), used by `maintenance.prune-jobs`. Distinct from
  // `JOB_RETENTION_MS`/`JOB_RETENTION_MAX` above (a short, always-on in-memory hygiene sweep) —
  // these are the longer, operator-configurable horizons the THOTH-063 spec calls for: at least
  // 7 days for `completed`, at least 30 days for `dead` (so a dead job stays diagnosable for a
  // month by default).
  JOB_COMPLETED_RETENTION_DAYS: positiveInt({ default: 7 }),
  JOB_DEAD_RETENTION_DAYS: positiveInt({ default: 30 }),
  // THOTH-071 Web Push delivery. All three VAPID fields resolve to values persisted by
  // `scripts/ensure-vapid-keys.mjs` (see `apps/jobs/src/notifications/vapid.ts`) if unset, so
  // the running process always finds a full pair regardless of how it was provisioned.
  WEB_PUSH_ENABLED: bool({ default: true }),
  WEB_PUSH_VAPID_PUBLIC_KEY: str({ default: undefined }),
  WEB_PUSH_VAPID_PRIVATE_KEY: str({ default: undefined }),
  WEB_PUSH_VAPID_SUBJECT: str({ default: undefined }),
  WEB_PUSH_VAPID_DIR: str({ default: undefined }),
  WEB_PUSH_DELIVERY_TIMEOUT_MS: positiveInt({ default: 10_000 }),
  WEB_PUSH_DELIVERY_BACKOFF_BASE_MS: positiveInt({ default: 1000 }),
  WEB_PUSH_DELIVERY_TTL_SECONDS: positiveInt({ default: 86_400 }),
};

export type JobsEnvironment = ReturnType<typeof cleanEnv<typeof environmentSchema>>;

let cachedEnvironment: JobsEnvironment | null = null;

export function getEnvironment(): JobsEnvironment {
  if (cachedEnvironment === null) {
    cachedEnvironment = cleanEnv(process.env, environmentSchema);
  }
  return cachedEnvironment;
}

/** Test-only helper to force environment re-validation with a fresh `process.env`. */
export function resetEnvironmentCacheForTests(): void {
  cachedEnvironment = null;
}
