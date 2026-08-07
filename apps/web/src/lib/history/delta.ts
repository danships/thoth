import DiffMatchPatch from 'diff-match-patch';

// Fresh instance per call keeps this module stateless/thread-safe-ish (no shared mutable
// `Diff_Timeout`/`Match_Threshold` tuning between callers); construction is cheap.
function createEngine(): DiffMatchPatch {
  return new DiffMatchPatch();
}

/**
 * Builds a `diff-match-patch` unified patch (as text, for storage) that transforms `prev` into
 * `next`.
 */
export function makePatch(previous: string, next: string): string {
  const dmp = createEngine();
  const patches = dmp.patch_make(previous, next);
  return dmp.patch_toText(patches);
}

export type ApplyPatchResult = { ok: true; content: string } | { ok: false; content: null };

/**
 * Applies a stored patch-text against `prev`, relying on `diff-match-patch`'s fuzzy matching to
 * survive minor drift. Returns `ok: false` (never throws) if any hunk fails to apply, so callers
 * can fall back to the nearest preceding baseline instead of crashing reconstruction.
 */
export function applyPatch(previous: string, patchText: string): ApplyPatchResult {
  const dmp = createEngine();
  try {
    const patches = dmp.patch_fromText(patchText);
    const [content, applied] = dmp.patch_apply(patches, previous);
    if (applied.some((wasApplied) => !wasApplied)) {
      return { ok: false, content: null };
    }
    return { ok: true, content };
  } catch {
    return { ok: false, content: null };
  }
}

export type ChangeSummary = { charsAdded: number; charsRemoved: number };

/**
 * Reports the number of characters inserted/removed going from `prev` to `next`, used to render
 * timeline rows (e.g. "+12/-3") without reconstructing full content.
 */
export function summarise(previous: string, next: string): ChangeSummary {
  const dmp = createEngine();
  const diffs = dmp.diff_main(previous, next);
  dmp.diff_cleanupSemantic(diffs);

  let charsAdded = 0;
  let charsRemoved = 0;
  for (const [operation, text] of diffs) {
    if (operation === 1) {
      charsAdded += text.length;
    } else if (operation === -1) {
      charsRemoved += text.length;
    }
  }

  return { charsAdded, charsRemoved };
}

export type DiffOp = readonly [number, string];

/**
 * Produces the char-level diff ops (`[-1|0|1, text]` tuples) used to render a visual diff
 * client-side, e.g. via `markdown-diff-view`.
 */
export function diffOps(previous: string, next: string): DiffOp[] {
  const dmp = createEngine();
  const diffs = dmp.diff_main(previous, next);
  dmp.diff_cleanupSemantic(diffs);
  return diffs;
}
