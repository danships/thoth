import { describe, test, expect } from 'vitest';
import {
  searchSyncPageDedupeKey,
  searchReconcileWorkspaceDedupeKey,
  searchSyncPagePayloadV1Schema,
  searchReconcileWorkspacePayloadV1Schema,
  searchScanWorkspacesPayloadV1Schema,
} from './search-job.js';

describe('search-job dedupe keys', () => {
  test('searchSyncPageDedupeKey is stable per workspace/page pair', () => {
    expect(searchSyncPageDedupeKey({ workspaceId: 'w1', pageId: 'p1' })).toBe('search:page:w1:p1');
  });

  test('searchReconcileWorkspaceDedupeKey is stable per workspace', () => {
    expect(searchReconcileWorkspaceDedupeKey({ workspaceId: 'w1' })).toBe('search:workspace:w1');
  });
});

describe('search-job payload schemas', () => {
  test('searchSyncPagePayloadV1Schema rejects extra fields (strict)', () => {
    const result = searchSyncPagePayloadV1Schema.safeParse({ workspaceId: 'w1', pageId: 'p1', extra: true });
    expect(result.success).toBe(false);
  });

  test('searchReconcileWorkspacePayloadV1Schema accepts an optional cursor', () => {
    const result = searchReconcileWorkspacePayloadV1Schema.safeParse({
      workspaceId: 'w1',
      cursor: { createdAt: new Date().toISOString(), id: 'p1' },
    });
    expect(result.success).toBe(true);
  });

  test('searchScanWorkspacesPayloadV1Schema accepts an empty payload', () => {
    const result = searchScanWorkspacesPayloadV1Schema.safeParse({});
    expect(result.success).toBe(true);
  });
});
