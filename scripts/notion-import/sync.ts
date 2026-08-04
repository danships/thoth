// Pure sync/conflict decision logic: given a mapping (or its absence) and the Notion object's
// current `last_edited_time`, decide whether to create, update, skip, or flag a conflict. Kept
// separate from any I/O so the decision table itself is trivially unit-testable.

import type { Mapping } from './types';

export type SyncDecision =
  | { action: 'create' }
  | { action: 'skip_unchanged' }
  | { action: 'update' }
  | { action: 'conflict'; detail: string }
  | { action: 'skip_archived'; detail: string };

export type SyncDecisionInput = {
  mapping: Mapping | undefined;
  notionLastEditedTime: string;
  notionArchived: boolean;
};

// Step 1: decide whether we need to look at Thoth's current state at all. `needsThothRead` is
// true only when the Notion object changed since the last import and we must check for a
// conflicting local edit before overwriting.
export function decideInitialAction(input: SyncDecisionInput): SyncDecision | { action: 'needs_thoth_read' } {
  const { mapping, notionLastEditedTime, notionArchived } = input;

  if (!mapping) {
    return { action: 'create' };
  }

  if (notionArchived) {
    return { action: 'skip_archived', detail: 'archived in Notion — kept in Thoth' };
  }

  const notionEditedAt = new Date(notionLastEditedTime).getTime();
  const previouslyImportedEditedAt = new Date(mapping.notionLastEditedTime).getTime();
  // Treat either side as "changed" if it doesn't parse as a valid date — silently comparing
  // `NaN > NaN` (`false`) would otherwise make an unparseable timestamp always look unchanged
  // and skip re-processing an object that may genuinely need it.
  const notionChanged =
    Number.isNaN(notionEditedAt) || Number.isNaN(previouslyImportedEditedAt)
      ? true
      : notionEditedAt > previouslyImportedEditedAt;
  if (!notionChanged) {
    return { action: 'skip_unchanged' };
  }

  return { action: 'needs_thoth_read' };
}

// Step 2: once the current Thoth content hash has been read back, decide update vs. conflict by
// comparing it against the hash of what THIS script last wrote (`importedContentHash`). If they
// differ, a human (or another integration) edited the Thoth copy since the last import — never
// overwrite it.
export function decideAfterThothRead(mapping: Mapping, currentThothHash: string): SyncDecision {
  if (currentThothHash !== mapping.importedContentHash) {
    return {
      action: 'conflict',
      detail: `edited in Thoth since the last import (Notion was last edited at ${mapping.notionLastEditedTime}) — skipped`,
    };
  }
  return { action: 'update' };
}
