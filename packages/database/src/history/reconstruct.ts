import { applyPatch } from './delta.js';
import type { PageValue } from '../schemas/entities/container.js';
import type { PageRevisionKind } from '../schemas/entities/page-revision.js';

// Minimal shape reconstruction needs — decoupled from the full `PageRevision` database entity
// so this module stays pure/testable without a database.
export type ContentRevisionLike = {
  sequence: number;
  kind: PageRevisionKind;
  content: string;
  patch: string;
};

export type ValuesRevisionLike = {
  sequence: number;
  valuesBefore: string; // JSON: Record<string, PageValue | null>
};

/**
 * Finds the highest-sequence baseline (`snapshot`/`consolidated`, i.e. a row carrying full
 * content) with `sequence <= targetSeq`. A baseline exists at least every `SNAPSHOT_INTERVAL`
 * sequences, so this is always found for any valid `targetSeq` within the retained history.
 */
export function nearestBaseline(
  revisions: readonly ContentRevisionLike[],
  targetSeq: number
): ContentRevisionLike | undefined {
  let best: ContentRevisionLike | undefined;
  for (const revision of revisions) {
    if (revision.kind === 'patch') {
      continue;
    }
    if (revision.sequence > targetSeq) {
      continue;
    }
    if (!best || revision.sequence > best.sequence) {
      best = revision;
    }
  }
  return best;
}

/**
 * Reconstructs page markdown content at `targetSeq` by starting from the nearest preceding
 * baseline and replaying `patch` rows forward in ascending sequence order. Falls back to the
 * baseline's own content (rather than throwing) if any patch fails to apply, per the "corrupt /
 * unapplyable patch chain" edge case — callers that need to know about the failure should check
 * for it themselves (e.g. by comparing recomputed content against an independent check), this
 * function always returns *something* reconstructable.
 */
export function reconstructAt(revisions: readonly ContentRevisionLike[], targetSeq: number): string {
  const base = nearestBaseline(revisions, targetSeq);
  if (!base) {
    return '';
  }

  let content = base.content;

  const toReplay = revisions
    .filter((revision) => revision.sequence > base.sequence && revision.sequence <= targetSeq)
    .toSorted((a, b) => a.sequence - b.sequence);

  for (const revision of toReplay) {
    if (revision.kind === 'patch') {
      const result = applyPatch(content, revision.patch);
      if (!result.ok) {
        // Unrecoverable — stop here and return the last good reconstruction (the nearest
        // preceding baseline content, since we bail on the very first unapplyable hunk).
        return content;
      }
      content = result.content;
    } else {
      // A snapshot/consolidated row in the replay window (shouldn't normally happen since
      // `nearestBaseline` would have picked the latest one, but handle defensively) simply
      // resets the running content.
      content = revision.content;
    }
  }

  return content;
}

/**
 * Reconstructs the page `values` state as of `targetSeq` by starting from the *current* values
 * and walking values revisions with `sequence > targetSeq` in descending order, assigning each
 * `[columnId, oldValue]` pair from `valuesBefore` back onto the accumulator (`null` deletes the
 * key). Applying newest-first correctly rolls back columns changed multiple times.
 */
export function reconstructValuesAt(
  currentValues: Record<string, PageValue>,
  valuesRevisions: readonly ValuesRevisionLike[],
  targetSeq: number
): Record<string, PageValue> {
  const result: Record<string, PageValue> = { ...currentValues };

  const toUndo = valuesRevisions
    .filter((revision) => revision.sequence > targetSeq)
    .toSorted((a, b) => b.sequence - a.sequence);

  for (const revision of toUndo) {
    let before: Record<string, PageValue | null>;
    try {
      before = JSON.parse(revision.valuesBefore || '{}') as Record<string, PageValue | null>;
    } catch {
      // A malformed `valuesBefore` row shouldn't take down the whole reconstruction — skip it
      // and keep applying the rest of the (well-formed) undo chain.
      continue;
    }
    for (const [columnId, value] of Object.entries(before)) {
      if (value === null) {
        delete result[columnId];
      } else {
        result[columnId] = value;
      }
    }
  }

  return result;
}
