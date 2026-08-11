import { TestNoopJobPayloadSchema, type TestNoopJobPayload, type JobDefinition } from '@thoth/job-protocol';

/**
 * Test-only no-op internal job (THOTH-059). Only registered when `NODE_ENV === 'test'` (see
 * `handlers/index.ts`) so integration tests can drive the full enqueue -> claim -> run ->
 * terminal-log path without a production job primitive. It performs no real work.
 */
export const testNoopJobDefinition: JobDefinition<TestNoopJobPayload> = {
  type: 'test.noop',
  payloadVersion: 1,
  payloadSchema: TestNoopJobPayloadSchema,
  priority: 0,
  maxAttempts: 1,
  handler: async () => {
    return { ok: true };
  },
};
