import { describe, test, expect } from 'vitest';
import { ExternalJobRequestSchema, TestNoopExternalJobRequestSchema } from './external-job.js';
import { webhookDispatchExternalJobRequestSchema, webhookRedeliverExternalJobRequestSchema } from './webhook-job.js';

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

  test('accepts a webhook.dispatch job even in test environment', () => {
    const result = ExternalJobRequestSchema.safeParse({
      type: 'webhook.dispatch',
      payloadVersion: 1,
      payload: {
        workspaceId: 'workspace-1',
        containerId: 'page-1',
        event: 'page.updated',
        actor: { type: 'user', userId: 'user-1' },
      },
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

describe('webhook.dispatch external schema', () => {
  test('accepts a minimal valid payload', () => {
    const result = webhookDispatchExternalJobRequestSchema.safeParse({
      type: 'webhook.dispatch',
      payloadVersion: 1,
      payload: {
        workspaceId: 'workspace-1',
        containerId: 'page-1',
        event: 'page.created',
        actor: { type: 'app', appId: 'app-1', userId: 'user-1' },
      },
    });
    expect(result.success).toBe(true);
  });

  test('accepts bounded valueChanges', () => {
    const result = webhookDispatchExternalJobRequestSchema.safeParse({
      type: 'webhook.dispatch',
      payloadVersion: 1,
      payload: {
        workspaceId: 'workspace-1',
        containerId: 'page-1',
        event: 'page.updated',
        actor: { type: 'user', userId: 'user-1' },
        valueChanges: {
          'col-1': { previous: { type: 'string', value: 'a' }, new: { type: 'string', value: 'b' } },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  test('rejects a dedupeKey field — caller must never choose the coalescing key', () => {
    const result = webhookDispatchExternalJobRequestSchema.safeParse({
      type: 'webhook.dispatch',
      payloadVersion: 1,
      payload: {
        workspaceId: 'workspace-1',
        containerId: 'page-1',
        event: 'page.updated',
        actor: { type: 'user', userId: 'user-1' },
      },
      dedupeKey: 'attacker-chosen',
    });
    expect(result.success).toBe(false);
  });

  test('rejects sessions/secrets/urls smuggled onto the payload (strict)', () => {
    const result = webhookDispatchExternalJobRequestSchema.safeParse({
      type: 'webhook.dispatch',
      payloadVersion: 1,
      payload: {
        workspaceId: 'workspace-1',
        containerId: 'page-1',
        event: 'page.updated',
        actor: { type: 'user', userId: 'user-1' },
        webhookUrl: 'https://evil.example.com',
      },
    });
    expect(result.success).toBe(false);
  });

  test('rejects too many valueChanges entries', () => {
    const valueChanges: Record<string, unknown> = {};
    for (let index = 0; index < 260; index += 1) {
      valueChanges[`col-${index}`] = { previous: null, new: { type: 'string', value: 'x' } };
    }
    const result = webhookDispatchExternalJobRequestSchema.safeParse({
      type: 'webhook.dispatch',
      payloadVersion: 1,
      payload: {
        workspaceId: 'workspace-1',
        containerId: 'page-1',
        event: 'page.updated',
        actor: { type: 'user', userId: 'user-1' },
        valueChanges,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('webhook.redeliver external schema', () => {
  test('accepts a valid payload', () => {
    const result = webhookRedeliverExternalJobRequestSchema.safeParse({
      type: 'webhook.redeliver',
      payloadVersion: 1,
      payload: { deliveryId: 'delivery-1', idempotencyToken: 'token-1' },
    });
    expect(result.success).toBe(true);
  });

  test('rejects a missing idempotencyToken', () => {
    const result = webhookRedeliverExternalJobRequestSchema.safeParse({
      type: 'webhook.redeliver',
      payloadVersion: 1,
      payload: { deliveryId: 'delivery-1' },
    });
    expect(result.success).toBe(false);
  });
});
