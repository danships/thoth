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

  it('treats an unparseable Notion timestamp as changed rather than silently skipping', () => {
    const mapping = buildMapping({ notionLastEditedTime: '2026-01-01T00:00:00.000Z' });
    const decision = decideInitialAction({
      mapping,
      notionLastEditedTime: 'not-a-date',
      notionArchived: false,
    });
    expect(decision).toEqual({ action: 'needs_thoth_read' });
  });

  it('treats an unparseable stored timestamp as changed rather than silently skipping', () => {
    const mapping = buildMapping({ notionLastEditedTime: 'not-a-date' });
    const decision = decideInitialAction({
      mapping,
      notionLastEditedTime: '2026-01-01T00:00:00.000Z',
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

  it('creates for a never-before-seen object even if Notion reports it as archived (!mapping is checked first)', () => {
    const decision = decideInitialAction({
      mapping: undefined,
      notionLastEditedTime: '2026-02-01T00:00:00.000Z',
      notionArchived: true,
    });
    // The `!mapping` check runs before the `notionArchived` check, so an object we've never seen
    // before is always a `create` — there's nothing in Thoth to keep/skip yet, regardless of its
    // current archived state in Notion.
    expect(decision).toEqual({ action: 'create' });
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
