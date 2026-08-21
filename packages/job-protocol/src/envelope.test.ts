import { describe, test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { EnqueueJobRequestEnvelopeSchema, JobRequestEnvelopeSchema, JobResponseEnvelopeSchema } from './envelope.js';

describe('JobRequestEnvelopeSchema', () => {
  test('accepts a valid ping request', () => {
    const result = JobRequestEnvelopeSchema.safeParse({
      version: 1,
      requestId: randomUUID(),
      kind: 'ping',
    });
    expect(result.success).toBe(true);
  });

  test('rejects an unknown field on a ping request (strict)', () => {
    const result = JobRequestEnvelopeSchema.safeParse({
      version: 1,
      requestId: randomUUID(),
      kind: 'ping',
      priority: 10,
    });
    expect(result.success).toBe(false);
  });

  test('rejects an unsupported version', () => {
    const result = JobRequestEnvelopeSchema.safeParse({
      version: 2,
      requestId: randomUUID(),
      kind: 'ping',
    });
    expect(result.success).toBe(false);
  });

  test('rejects a non-uuid requestId', () => {
    const result = JobRequestEnvelopeSchema.safeParse({
      version: 1,
      requestId: 'not-a-uuid',
      kind: 'ping',
    });
    expect(result.success).toBe(false);
  });

  test('rejects an unknown kind', () => {
    const result = JobRequestEnvelopeSchema.safeParse({
      version: 1,
      requestId: randomUUID(),
      kind: 'dequeue',
    });
    expect(result.success).toBe(false);
  });

  test('rejects an enqueue request that smuggles internal scheduling fields', () => {
    const result = EnqueueJobRequestEnvelopeSchema.safeParse({
      version: 1,
      requestId: randomUUID(),
      kind: 'enqueue',
      job: { type: 'test.noop', payloadVersion: 1, payload: {} },
      priority: 100,
      runAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  test('accepts a valid search request', () => {
    const result = JobRequestEnvelopeSchema.safeParse({
      version: 1,
      requestId: randomUUID(),
      kind: 'search',
      workspaceId: 'workspace-1',
      query: 'invoice',
      limit: 10,
      grant: { workspaceId: 'workspace-1', permission: 'read', scopeType: 'workspace' },
    });
    expect(result.success).toBe(true);
  });

  test('rejects a search request whose grant carries too many scoped container ids', () => {
    const result = JobRequestEnvelopeSchema.safeParse({
      version: 1,
      requestId: randomUUID(),
      kind: 'search',
      workspaceId: 'workspace-1',
      query: 'invoice',
      limit: 10,
      grant: {
        workspaceId: 'workspace-1',
        permission: 'read',
        scopeType: 'containers',
        scopedContainerIds: Array.from({ length: 5001 }, (_, index) => `container-${index}`),
      },
    });
    expect(result.success).toBe(false);
  });

  test('rejects a search request with a limit outside 1-20', () => {
    const result = JobRequestEnvelopeSchema.safeParse({
      version: 1,
      requestId: randomUUID(),
      kind: 'search',
      workspaceId: 'workspace-1',
      query: 'invoice',
      limit: 21,
      grant: { workspaceId: 'workspace-1', permission: 'read', scopeType: 'workspace' },
    });
    expect(result.success).toBe(false);
  });

  test('rejects a search request with a blank query', () => {
    const result = JobRequestEnvelopeSchema.safeParse({
      version: 1,
      requestId: randomUUID(),
      kind: 'search',
      workspaceId: 'workspace-1',
      query: '   ',
      limit: 10,
      grant: { workspaceId: 'workspace-1', permission: 'read', scopeType: 'workspace' },
    });
    expect(result.success).toBe(false);
  });
});

describe('JobResponseEnvelopeSchema', () => {
  test('accepts a valid success response', () => {
    const result = JobResponseEnvelopeSchema.safeParse({
      version: 1,
      requestId: randomUUID(),
      ok: true,
      result: { jobId: 'job-1', disposition: 'created' },
    });
    expect(result.success).toBe(true);
  });

  test('accepts a valid error response', () => {
    const result = JobResponseEnvelopeSchema.safeParse({
      version: 1,
      requestId: randomUUID(),
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'bad request', retryable: false },
    });
    expect(result.success).toBe(true);
  });

  test('rejects an error response with an unknown error code', () => {
    const result = JobResponseEnvelopeSchema.safeParse({
      version: 1,
      requestId: randomUUID(),
      ok: false,
      error: { code: 'SOMETHING_ELSE', message: 'bad request', retryable: false },
    });
    expect(result.success).toBe(false);
  });

  test('rejects a response body containing a stack trace-like field (strict)', () => {
    const result = JobResponseEnvelopeSchema.safeParse({
      version: 1,
      requestId: randomUUID(),
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'bad request', retryable: false, stack: 'at foo()' },
    });
    expect(result.success).toBe(false);
  });
});
