import { describe, test, expect } from 'vitest';
import { ExternalJobRequestSchema, TestNoopExternalJobRequestSchema } from './external-job';

// vitest sets NODE_ENV=test, so ExternalJobRequestSchema resolves to the test-only diagnostic
// schema here. This test asserts that behaviour explicitly rather than relying on it silently.
describe('ExternalJobRequestSchema (test environment)', () => {
  test('accepts the test.noop diagnostic job when NODE_ENV=test', () => {
    expect(process.env['NODE_ENV']).toBe('test');
    const result = ExternalJobRequestSchema.safeParse({
      type: 'test.noop',
      payloadVersion: 1,
      payload: { note: 'hello' },
    });
    expect(result.success).toBe(true);
  });

  test('rejects unknown job types', () => {
    const result = TestNoopExternalJobRequestSchema.safeParse({
      type: 'purge.workspace',
      payloadVersion: 1,
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  test('rejects unknown fields on the payload (strict)', () => {
    const result = TestNoopExternalJobRequestSchema.safeParse({
      type: 'test.noop',
      payloadVersion: 1,
      payload: { note: 'hi', priority: 10 },
    });
    expect(result.success).toBe(false);
  });

  test('rejects attempts to smuggle a priority or maxAttempts field', () => {
    const result = TestNoopExternalJobRequestSchema.safeParse({
      type: 'test.noop',
      payloadVersion: 1,
      payload: {},
      priority: 5,
      maxAttempts: 10,
    });
    expect(result.success).toBe(false);
  });
});
