import { z } from 'zod';

/**
 * External job payload accepted over the Unix-socket IPC boundary (THOTH-059).
 *
 * This is intentionally NOT the same type as the internal job registry used by the worker for
 * scheduled/maintenance jobs (webhooks, purge, history, ...) — those are wired in-process by
 * `@thoth/jobs` and are never reachable from an external caller. Keeping this schema separate
 * (and, in production, accepting nothing at all) prevents a caller on the socket from choosing
 * an internal job type, its priority, its retry policy or its schedule.
 *
 * For THOTH-059 production builds accept no external job type (the union below only ever
 * validates in a test process). A harmless internal diagnostic job (`test.noop`) is exposed
 * only when `NODE_ENV === 'test'` so integration tests can exercise the full enqueue → run →
 * terminal-log path without a production job primitive. Real producer types (page-change
 * webhooks, etc.) are added in THOTH-061.
 */

export const TestNoopJobPayloadSchema = z
  .object({
    // Optional short note purely for assertions in tests; never persisted long-term or logged
    // in full (see queue-service result summaries).
    note: z.string().max(200).optional(),
  })
  .strict();

export type TestNoopJobPayload = z.infer<typeof TestNoopJobPayloadSchema>;

export const TestNoopExternalJobRequestSchema = z
  .object({
    type: z.literal('test.noop'),
    payloadVersion: z.literal(1),
    payload: TestNoopJobPayloadSchema,
    // Optional dedupe key so tests can exercise enqueue coalescing over the socket.
    dedupeKey: z.string().min(1).max(200).optional(),
  })
  .strict();

export type TestNoopExternalJobRequest = z.infer<typeof TestNoopExternalJobRequestSchema>;

/** True only inside test runs; gates the only externally-reachable job type for THOTH-059. */
function isTestEnvironment(): boolean {
  return process.env['NODE_ENV'] === 'test';
}

/**
 * The externally accepted job schema. In non-test environments this never validates any
 * payload (an "empty union" in practice), matching the spec's requirement that production
 * exposes no externally triggerable job type yet.
 */
export const ExternalJobRequestSchema: z.ZodType<TestNoopExternalJobRequest> = isTestEnvironment()
  ? TestNoopExternalJobRequestSchema
  : (z.never() as unknown as z.ZodType<TestNoopExternalJobRequest>);

export type ExternalJobRequest = TestNoopExternalJobRequest;
