/**
 * Capped exponential backoff with full jitter (THOTH-059). `clock`/`random` are injectable so
 * tests can assert deterministic bounds without real timers or `Math.random()`.
 */
export type BackoffOptions = {
  baseMs?: number;
  capMs?: number;
  random?: () => number;
};

const DEFAULT_BASE_MS = 500;
const DEFAULT_CAP_MS = 5 * 60 * 1000; // 5 minutes

/** Returns a delay in milliseconds for the given attempt (1-indexed) using full jitter. */
export function computeBackoffMs(attempt: number, options: BackoffOptions = {}): number {
  const baseMs = options.baseMs ?? DEFAULT_BASE_MS;
  const capMs = options.capMs ?? DEFAULT_CAP_MS;
  const random = options.random ?? Math.random;

  const exponential = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(random() * exponential);
}
