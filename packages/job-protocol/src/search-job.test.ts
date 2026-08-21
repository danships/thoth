import { describe, test, expect } from 'vitest';
import {
  searchSyncPageDedupeKey,
  searchReconcileWorkspaceDedupeKey,
  mergeSearchReconcileWorkspacePayload,
  searchSyncPagePayloadV1Schema,
  searchReconcileWorkspacePayloadV1Schema,
  searchScanWorkspacesPayloadV1Schema,
} from './search-job.js';

describe('search-job dedupe keys', () => {
  test('searchSyncPageDedupeKey is stable per workspace/page pair', () => {
    expect(searchSyncPageDedupeKey({ workspaceId: 'w1', pageId: 'p1' })).toBe(
      searchSyncPageDedupeKey({ workspaceId: 'w1', pageId: 'p1' })
    );
  });

  test('searchSyncPageDedupeKey does not collide when a colon-containing id shifts the boundary', () => {
    // Naive `${workspaceId}:${pageId}` interpolation would make these two pairs collide.
    const first = searchSyncPageDedupeKey({ workspaceId: 'a:b', pageId: 'c' });
    const second = searchSyncPageDedupeKey({ workspaceId: 'a', pageId: 'b:c' });
    expect(first).not.toBe(second);
  });

  test('searchReconcileWorkspaceDedupeKey is stable per workspace', () => {
    expect(searchReconcileWorkspaceDedupeKey({ workspaceId: 'w1' })).toBe('search:workspace:w1');
  });
});

describe('mergeSearchReconcileWorkspacePayload', () => {
  test('keeps the queued continuation cursor when a cursor-less scan re-enqueues the workspace', () => {
    // `search.scan-workspaces` re-enqueues every workspace with no cursor on each pass; a
    // continuation from a prior batch must not be reset back to the start.
    const existing = { workspaceId: 'w1', cursor: { createdAt: '2024-01-02T00:00:00.000Z', id: 'p5' } };
    const incoming = { workspaceId: 'w1' };
    expect(mergeSearchReconcileWorkspacePayload(existing, incoming)).toEqual(existing);
  });

  test('adopts an incoming cursor when nothing was queued yet', () => {
    const existing = { workspaceId: 'w1' };
    const incoming = { workspaceId: 'w1', cursor: { createdAt: '2024-01-02T00:00:00.000Z', id: 'p5' } };
    expect(mergeSearchReconcileWorkspacePayload(existing, incoming)).toEqual(incoming);
  });

  test('keeps whichever cursor is furthest along when both requests carry one', () => {
    const behind = { workspaceId: 'w1', cursor: { createdAt: '2024-01-01T00:00:00.000Z', id: 'p1' } };
    const ahead = { workspaceId: 'w1', cursor: { createdAt: '2024-01-02T00:00:00.000Z', id: 'p5' } };
    expect(mergeSearchReconcileWorkspacePayload(behind, ahead)).toEqual(ahead);
    expect(mergeSearchReconcileWorkspacePayload(ahead, behind)).toEqual(ahead);
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
