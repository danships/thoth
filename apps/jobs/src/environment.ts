import { cleanEnv, makeValidator, str, EnvError } from 'envalid';

/**
 * Environment validation for `@thoth/jobs` (THOTH-059).
 *
 * Deliberately does NOT import `apps/web`'s environment validator: the jobs process must be
 * able to boot without any Next.js/web dependency and without a `DB` variable — job state is
 * held entirely in memory (see the package README / THOTH-059 spec), so there is nothing here
 * that requires a database connection string.
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
