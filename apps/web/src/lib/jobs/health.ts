import { pingJobService } from '@thoth/job-protocol';

// Much shorter than the client's normal enqueue timeouts (`DEFAULT_CONNECT_TIMEOUT_MS`/
// `DEFAULT_RESPONSE_TIMEOUT_MS`, both 2000ms): a health probe must fail fast so `/api/health`
// stays responsive for load balancers/orchestrators even while the jobs socket is down.
const HEALTH_CONNECT_TIMEOUT_MS = 500;
const HEALTH_RESPONSE_TIMEOUT_MS = 500;

/**
 * Web-only readiness adapter around the `@thoth/job-protocol` client (THOTH-060). Never
 * enqueues, never touches the application database, and never logs on a per-probe basis —
 * `/api/health` may be polled frequently by container/orchestrator healthchecks, and a
 * down/restarting jobs process is an expected, transient state, not an error worth logging
 * every few seconds. Returns a plain boolean; callers must not leak the underlying error,
 * socket path, or any other detail back to a client.
 *
 * Reads `JOB_SOCKET_PATH` directly from `process.env` rather than through the full
 * `getEnvironment()` schema: health readiness must not be coupled to (or fail because of)
 * unrelated app configuration (`DB`, `BETTER_AUTH_SECRET`, etc.) being valid.
 */
export async function isJobsServiceReady(): Promise<boolean> {
  const socketPath = process.env['JOB_SOCKET_PATH'];

  // No socket path configured (e.g. a targeted `dev:web` run with no jobs service supplied) —
  // health must correctly report jobs as unavailable rather than guessing a default path.
  if (!socketPath) {
    return false;
  }

  try {
    const response = await pingJobService({
      socketPath,
      connectTimeoutMs: HEALTH_CONNECT_TIMEOUT_MS,
      responseTimeoutMs: HEALTH_RESPONSE_TIMEOUT_MS,
    });
    return response.ok;
  } catch {
    // Connect refused/timed out, response timed out/malformed, or the service is shutting down
    // (`SHUTTING_DOWN`, surfaced as `ok: false` above) — all map to "not ready" without
    // exposing the failure reason.
    return false;
  }
}
