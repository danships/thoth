const RETRY_CAP_MS = 5 * 60 * 1000; // 5 minutes — same cap as the queue's own backoff.

/**
 * Parses a `Retry-After` response header (seconds or an HTTP-date) into a bounded delay in
 * milliseconds, or `undefined` if the header is missing/malformed — callers fall back to the
 * queue's own exponential-backoff delay in that case. Never returns a value beyond
 * `RETRY_CAP_MS` regardless of what the receiver sent, and never a negative delay.
 */
export function parseRetryAfterMs(headerValue: string | null, now: () => Date = () => new Date()): number | undefined {
  if (!headerValue) {
    return undefined;
  }

  const trimmed = headerValue.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  // Numeric form: delay-seconds.
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(seconds) || seconds < 0) {
      return undefined;
    }
    return Math.min(seconds * 1000, RETRY_CAP_MS);
  }

  // HTTP-date form.
  const asDate = new Date(trimmed);
  if (Number.isNaN(asDate.getTime())) {
    return undefined;
  }
  const deltaMs = asDate.getTime() - now().getTime();
  if (deltaMs <= 0) {
    return 0;
  }
  return Math.min(deltaMs, RETRY_CAP_MS);
}

export { RETRY_CAP_MS };
