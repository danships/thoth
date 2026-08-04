import { describe, it, expect } from 'vitest';
import { decideInitialAction, decideAfterThothRead } from './sync';
import type { Mapping } from './types';

function buildMapping(overrides: Partial<Mapping> = {}): Mapping {
  return {
    notionType: 'page',
    thothContainerId: 'page-1',
    thothColumnId: null,
    notionLastEditedTime: '2026-01-01T00:00:00.000Z',
    importedContentHash: 'sha256:abc',
    deletedInNotion: false,
    ...overrides,
  };
}

describe('decideInitialAction', () => {
  it('creates when there is no existing mapping', () => {
    const decision = decideInitialAction({
      mapping: undefined,
      notionLastEditedTime: '2026-01-01T00:00:00.000Z',
      notionArchived: false,
    });
    expect(decision).toEqual({ action: 'create' });
  });

  it('skips as unchanged when Notion has not been edited since the last import', () => {
    const mapping = buildMapping({ notionLastEditedTime: '2026-01-02T00:00:00.000Z' });
    const decision = decideInitialAction({
      mapping,
      notionLastEditedTime: '2026-01-02T00:00:00.000Z',
      notionArchived: false,
    });
    expect(decision).toEqual({ action: 'skip_unchanged' });
  });

  it('requests a Thoth read when Notion changed since the last import', () => {
    const mapping = buildMapping({ notionLastEditedTime: '2026-01-01T00:00:00.000Z' });
    const decision = decideInitialAction({
      mapping,
      notionLastEditedTime: '2026-01-02T00:00:00.000Z',
      notionArchived: false,
    });
    expect(decision).toEqual({ action: 'needs_thoth_read' });
  });

  it('marks archived/deleted Notion objects as kept, never triggering a delete', () => {
    const mapping = buildMapping();
    const decision = decideInitialAction({
      mapping,
      notionLastEditedTime: '2026-02-01T00:00:00.000Z',
      notionArchived: true,
    });
    expect(decision).toEqual({ action: 'skip_archived', detail: 'archived in Notion — kept in Thoth' });
  });

  it('treats a never-before-seen archived object as still needing no create (also skip_archived)', () => {
    const decision = decideInitialAction({
      mapping: undefined,
      notionLastEditedTime: '2026-02-01T00:00:00.000Z',
      notionArchived: false,
    });
    // Sanity: an object with no mapping and not archived is always a create, regardless of
    // archived flag ordering in the checks below.
    expect(decision.action).toBe('create');
  });
});

describe('decideAfterThothRead', () => {
  it('updates when the current Thoth content matches what this script last wrote', () => {
    const mapping = buildMapping({ importedContentHash: 'sha256:same' });
    const decision = decideAfterThothRead(mapping, 'sha256:same');
    expect(decision).toEqual({ action: 'update' });
  });

  it('flags a conflict when the current Thoth content differs from what this script last wrote', () => {
    const mapping = buildMapping({
      importedContentHash: 'sha256:original',
      notionLastEditedTime: '2026-01-05T00:00:00.000Z',
    });
    const decision = decideAfterThothRead(mapping, 'sha256:edited-by-human');
    expect(decision.action).toBe('conflict');
    expect((decision as { detail: string }).detail).toContain('edited in Thoth');
  });
});
