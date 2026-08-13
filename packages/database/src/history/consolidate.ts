import { CONSOLIDATION_AGE_MS } from './constants.js';
import type { PageRevisionKind } from '../schemas/entities/page-revision.js';

export type ConsolidationCandidateRevision = {
  id: string;
  sequence: number;
  kind: PageRevisionKind;
  createdAt: string;
};

export type ConsolidationRun = {
  ids: string[];
  startSequence: number;
  endSequence: number;
  // The baseline sequence the consolidated row's `previousSequence` should point at (`null` if
  // the run started at the very beginning of history).
  previousSequence: number | null;
};

/**
 * Finds the oldest contiguous run of `patch` rows sitting strictly between two baselines
 * (`snapshot`/`consolidated`) that is entirely older than `CONSOLIDATION_AGE_MS`. A run still
 * growing at the tail of history (i.e. not yet closed off by a following baseline) is never
 * selected — it isn't "sealed" yet. Only revisions of a single content stream (already sorted or
 * not) should be passed in; this function sorts by `sequence` itself.
 */
export function selectConsolidationRun(
  revisions: readonly ConsolidationCandidateRevision[],
  now: Date
): ConsolidationRun | undefined {
  const sorted = revisions.toSorted((a, b) => a.sequence - b.sequence);
  const cutoff = now.getTime() - CONSOLIDATION_AGE_MS;

  let lastBaselineSequence: number | null = null;
  let run: ConsolidationCandidateRevision[] = [];

  for (const revision of sorted) {
    if (revision.kind === 'patch') {
      run.push(revision);
      continue;
    }

    // Hit a baseline — the accumulated run (if any) is now "sealed" (closed off by this
    // baseline). Check whether it qualifies for consolidation.
    if (run.length > 0) {
      const newestInRun = run.at(-1)!;
      if (new Date(newestInRun.createdAt).getTime() < cutoff) {
        return {
          ids: run.map((revision_) => revision_.id),
          startSequence: run[0]!.sequence,
          endSequence: newestInRun.sequence,
          previousSequence: lastBaselineSequence,
        };
      }
    }

    run = [];
    lastBaselineSequence = revision.sequence;
  }

  // A trailing run with no closing baseline yet is still "open" (e.g. the live coalescing head
  // sits at the very end) — never consolidated.
  return undefined;
}

/**
 * Finds *every* sealed, aged-out run in a single pass (unlike `selectConsolidationRun`, which
 * stops at the first). Used by scheduled maintenance (THOTH-062), which is allowed to touch
 * multiple bounded runs per execution — the synchronous save path only ever wants the first.
 */
export function selectAllConsolidationRuns(
  revisions: readonly ConsolidationCandidateRevision[],
  now: Date
): ConsolidationRun[] {
  const sorted = revisions.toSorted((a, b) => a.sequence - b.sequence);
  const cutoff = now.getTime() - CONSOLIDATION_AGE_MS;

  const runs: ConsolidationRun[] = [];
  let lastBaselineSequence: number | null = null;
  let run: ConsolidationCandidateRevision[] = [];

  for (const revision of sorted) {
    if (revision.kind === 'patch') {
      run.push(revision);
      continue;
    }

    if (run.length > 0) {
      const newestInRun = run.at(-1)!;
      if (new Date(newestInRun.createdAt).getTime() < cutoff) {
        runs.push({
          ids: run.map((revision_) => revision_.id),
          startSequence: run[0]!.sequence,
          endSequence: newestInRun.sequence,
          previousSequence: lastBaselineSequence,
        });
      }
    }

    run = [];
    lastBaselineSequence = revision.sequence;
  }

  return runs;
}
