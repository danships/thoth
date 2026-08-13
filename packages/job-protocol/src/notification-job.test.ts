import { describe, test, expect } from 'vitest';
import { notificationDispatchPayloadV1Schema, notificationActorSchema } from './notification-job.js';

describe('notificationDispatchPayloadV1Schema', () => {
  test('accepts a valid user-actor payload', () => {
    const result = notificationDispatchPayloadV1Schema.safeParse({
      workspaceId: 'workspace-1',
      containerId: 'page-1',
      event: 'page.updated',
      actor: { type: 'user', userId: 'user-1' },
      changeCount: 3,
      occurredAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  test('rejects extra fields (strict)', () => {
    const result = notificationDispatchPayloadV1Schema.safeParse({
      workspaceId: 'workspace-1',
      containerId: 'page-1',
      event: 'page.updated',
      actor: { type: 'user', userId: 'user-1' },
      changeCount: 3,
      occurredAt: new Date().toISOString(),
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });

  test('rejects a changeCount above the bound', () => {
    const result = notificationDispatchPayloadV1Schema.safeParse({
      workspaceId: 'workspace-1',
      containerId: 'page-1',
      event: 'page.updated',
      actor: { type: 'user', userId: 'user-1' },
      changeCount: 100_001,
      occurredAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  test('rejects a non-strict actor with an extra field', () => {
    const result = notificationActorSchema.safeParse({ type: 'user', userId: 'user-1', extra: 'x' });
    expect(result.success).toBe(false);
  });
});
