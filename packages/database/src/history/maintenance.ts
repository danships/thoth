import { getContainerRepository, getPageRevisionRepository } from '../repositories.js';
import type { PageRevision } from '../types.js';
import { reconstructAt, type ContentRevisionLike } from './reconstruct.js';
import { selectAllConsolidationRuns, type ConsolidationCandidateRevision } from './consolidate.js';
import { COALESCE_WINDOW_MS, MAX_REVISIONS } from './constants.js';

/**
 * Scheduled page-history maintenance (THOTH-062): consolidation of sealed, aged-out `patch` runs
 * into a single `consolidated` baseline, and `MAX_REVISIONS` retention — both moved out of the
 * synchronous save path (`revision-service.ts`) and run here instead, from the `history.maintain`
 * job. Bounded per execution (`MAX_RUNS_PER_EXECUTION`/`MAX_DELETES_PER_EXECUTION`) so a huge
 * history estate never monopolises a worker slot; callers (the job handler) re-enqueue when
 * `hasMoreWork` is true.
 */

// At most this many sealed content runs are consolidated in a single execution.
const MAX_RUNS_PER_EXECUTION = 5;
// At most this many excess rows are pruned per stream, per execution.
const MAX_DELETES_PER_EXECUTION = 200;

export type MaintenanceOutcome =
  | { status: 'no-op'; reason: 'page-missing' | 'page-not-a-page' | 'page-deleted' }
  | { status: 'stale'; reason: 'coalesce-window-open' | 'head-changed-before-mutation' }
  | {
      status: 'completed';
      streamsInspected: number;
      runsConsolidated: number;
      rowsPruned: number;
      malformedStreams: Array<'content' | 'values'>;
      hasMoreWork: boolean;
    };

export type MaintainPageHistoryInput = {
  workspaceId: string;
  containerId: string;
  /** Injectable clock for tests; defaults to `() => new Date()`. */
  now?: () => Date;
};

async function loadStreamRevisions(containerId: string, target: 'content' | 'values'): Promise<PageRevision[]> {
  const repo = await getPageRevisionRepository();
  return repo.getByQuery(
    repo.createQuery().eq('containerId', containerId).eq('target', target).sort('sequence', 'asc')
  );
}

function toContentRevisionLike(revision: PageRevision): ContentRevisionLike {
  return { sequence: revision.sequence, kind: revision.kind, content: revision.content, patch: revision.patch };
}

function toConsolidationCandidate(revision: PageRevision): ConsolidationCandidateRevision {
  return { id: revision.id, sequence: revision.sequence, kind: revision.kind, createdAt: revision.createdAt };
}

/**
 * Validates the basic chain invariants maintenance requires before ever mutating a stream:
 * unique, gap-free sequences relative to the first surviving revision (retention may have
 * pruned the stream down from sequence 1, so the first row is not required to start there, nor
 * to have a `null` `previousSequence`), and every `previousSequence` on a later row pointing
 * strictly before its own row's sequence. Returns `true` when the stream is safe to operate on.
 */
function isChainValid(revisions: readonly PageRevision[]): boolean {
  if (revisions.length === 0) {
    return true;
  }
  const sorted = revisions.toSorted((a, b) => a.sequence - b.sequence);
  const firstSequence = sorted[0]!.sequence;
  for (const [index, revision] of sorted.entries()) {
    if (revision.sequence !== firstSequence + index) {
      return false;
    }
    if (index > 0 && revision.previousSequence !== null && revision.previousSequence >= revision.sequence) {
      return false;
    }
  }
  return true;
}

/** The current head's `coalesceWindowEnd`/page `lastUpdated`, used to detect a save mid-flight. */
type StreamFingerprint = { headId: string | null; headSequence: number | null; headLastUpdated: string | null };

function fingerprintOf(revisions: readonly PageRevision[]): StreamFingerprint {
  const head = revisions.at(-1);
  return { headId: head?.id ?? null, headSequence: head?.sequence ?? null, headLastUpdated: head?.lastUpdated ?? null };
}

function fingerprintsMatch(a: StreamFingerprint, b: StreamFingerprint): boolean {
  return a.headId === b.headId && a.headSequence === b.headSequence && a.headLastUpdated === b.headLastUpdated;
}

/**
 * Merges one sealed, aged-out run of `patch` rows into a single `consolidated` snapshot at the
 * run's last sequence, mirroring the (now-removed) synchronous behaviour: the existing row at
 * `run.endSequence` is updated in place (never a second row at the same sequence), then earlier
 * rows in the run are deleted. Safe to re-run: if the row at `run.endSequence` is already
 * `consolidated` (a prior execution crashed after the conversion but before the deletes), the
 * conversion step is skipped and only the leftover earlier rows are removed.
 */
async function runConsolidation(
  allRevisions: readonly PageRevision[],
  run: { ids: string[]; endSequence: number; previousSequence: number | null },
  now: Date
): Promise<number> {
  const repo = await getPageRevisionRepository();
  const lastInRun = allRevisions.find((revision) => revision.sequence === run.endSequence);
  if (!lastInRun) {
    // Defensive: shouldn't happen given `run` was derived from `allRevisions` itself.
    return 0;
  }

  if (lastInRun.kind !== 'consolidated') {
    const content = reconstructAt(allRevisions.map((revision) => toContentRevisionLike(revision)), run.endSequence);
    await repo.update({
      ...lastInRun,
      previousSequence: run.previousSequence,
      kind: 'consolidated',
      content,
      patch: '',
      consolidated: true,
      lastUpdated: now.toISOString(),
    });
  }

  let deleted = 0;
  for (const id of run.ids) {
    if (id === lastInRun.id) {
      continue;
    }
    await repo.deleteUsingId(id);
    deleted += 1;
  }
  return deleted;
}

/**
 * Enforces `MAX_REVISIONS` per `(containerId, target)`, bounded to `MAX_DELETES_PER_EXECUTION`
 * per call. For `content`, prunes by dropping everything below the second-oldest baseline
 * (never the baseline required by a remaining patch) — a run with fewer than two baselines is
 * left untouched. For `values`, simply drops the oldest excess rows.
 */
async function enforceRetention(
  target: 'content' | 'values',
  revisions: readonly PageRevision[]
): Promise<{ pruned: number; hasMoreWork: boolean }> {
  if (revisions.length <= MAX_REVISIONS) {
    return { pruned: 0, hasMoreWork: false };
  }

  const repo = await getPageRevisionRepository();

  if (target === 'values') {
    const excess = revisions.length - MAX_REVISIONS;
    const bounded = Math.min(excess, MAX_DELETES_PER_EXECUTION);
    for (const revision of revisions.slice(0, bounded)) {
      await repo.deleteUsingId(revision.id);
    }
    return { pruned: bounded, hasMoreWork: bounded < excess };
  }

  const baselines = revisions.filter((revision) => revision.kind !== 'patch').toSorted((a, b) => a.sequence - b.sequence);
  if (baselines.length < 2) {
    return { pruned: 0, hasMoreWork: false };
  }
  const secondOldestBaselineSequence = baselines[1]!.sequence;
  const toDelete = revisions.filter((revision) => revision.sequence < secondOldestBaselineSequence);
  const bounded = toDelete.slice(0, MAX_DELETES_PER_EXECUTION);
  for (const revision of bounded) {
    await repo.deleteUsingId(revision.id);
  }
  return { pruned: bounded.length, hasMoreWork: bounded.length < toDelete.length };
}

/**
 * Performs one bounded maintenance pass for a single page's history: loads the live page/streams,
 * validates it's safe to touch, consolidates a bounded number of sealed runs, then enforces
 * retention on both streams. Always a safe no-op/stale-defer rather than a partial/corrupting
 * mutation — see the module doc above and the THOTH-062 spec's edge cases.
 */
export async function maintainPageHistory({
  workspaceId,
  containerId,
  now: clock,
}: MaintainPageHistoryInput): Promise<MaintenanceOutcome> {
  const now = (clock ?? (() => new Date()))();

  const containerRepository = await getContainerRepository();
  const page = await containerRepository.getOneByQuery(
    containerRepository.createQuery().eq('id', containerId).eq('workspaceId', workspaceId)
  );

  if (!page) {
    return { status: 'no-op', reason: 'page-missing' };
  }
  if (page.type !== 'page') {
    return { status: 'no-op', reason: 'page-not-a-page' };
  }
  if (page.deletedAt) {
    return { status: 'no-op', reason: 'page-deleted' };
  }

  const contentRevisions = await loadStreamRevisions(containerId, 'content');
  const valuesRevisions = await loadStreamRevisions(containerId, 'values');

  const contentHead = contentRevisions.at(-1);
  if (contentHead && now.getTime() < new Date(contentHead.coalesceWindowEnd).getTime()) {
    // Still inside the live coalesce window — a save could still land on this exact head row.
    return { status: 'stale', reason: 'coalesce-window-open' };
  }
  if (new Date(page.lastUpdated).getTime() > now.getTime() - COALESCE_WINDOW_MS) {
    // The page itself was touched too recently to be considered quiet, even if the content
    // stream's own coalesce window has technically elapsed (e.g. a values-only edit).
    return { status: 'stale', reason: 'coalesce-window-open' };
  }

  const contentValid = isChainValid(contentRevisions);
  const valuesValid = isChainValid(valuesRevisions);
  const malformedStreams: Array<'content' | 'values'> = [];
  if (!contentValid) {
    malformedStreams.push('content');
  }
  if (!valuesValid) {
    malformedStreams.push('values');
  }

  const fingerprintBefore = {
    content: fingerprintOf(contentRevisions),
    values: fingerprintOf(valuesRevisions),
  };

  const eligibleRuns = contentValid
    ? selectAllConsolidationRuns(contentRevisions.map((revision) => toConsolidationCandidate(revision)), now)
    : [];
  const runsToProcess = eligibleRuns.slice(0, MAX_RUNS_PER_EXECUTION);

  const needsContentRetentionCheck = contentValid && contentRevisions.length > MAX_REVISIONS;
  const needsValuesRetentionCheck = valuesValid && valuesRevisions.length > MAX_REVISIONS;
  const hasMutationWork = runsToProcess.length > 0 || needsContentRetentionCheck || needsValuesRetentionCheck;

  if (!hasMutationWork) {
    return {
      status: 'completed',
      streamsInspected: 2,
      runsConsolidated: 0,
      rowsPruned: 0,
      malformedStreams,
      hasMoreWork: false,
    };
  }

  // Immediately before the first mutation, re-read the page/stream heads and compare against the
  // fingerprint captured above. Any change (a save landed between load and mutation) aborts
  // without touching a single row.
  const revalidationContent = await loadStreamRevisions(containerId, 'content');
  const revalidationValues = await loadStreamRevisions(containerId, 'values');
  const revalidationPage = await containerRepository.getOneByQuery(
    containerRepository.createQuery().eq('id', containerId).eq('workspaceId', workspaceId)
  );
  if (
    !revalidationPage ||
    revalidationPage.lastUpdated !== page.lastUpdated ||
    !fingerprintsMatch(fingerprintBefore.content, fingerprintOf(revalidationContent)) ||
    !fingerprintsMatch(fingerprintBefore.values, fingerprintOf(revalidationValues))
  ) {
    return { status: 'stale', reason: 'head-changed-before-mutation' };
  }

  let runsConsolidated = 0;
  let rowsPruned = 0;

  for (const run of runsToProcess) {
    const deleted = await runConsolidation(contentRevisions, run, now);
    rowsPruned += deleted;
    runsConsolidated += 1;
  }

  let hasMoreWork = eligibleRuns.length > runsToProcess.length;

  if (needsContentRetentionCheck) {
    const postConsolidationContent = await loadStreamRevisions(containerId, 'content');
    const retentionResult = await enforceRetention('content', postConsolidationContent);
    rowsPruned += retentionResult.pruned;
    hasMoreWork = hasMoreWork || retentionResult.hasMoreWork;
  }

  if (needsValuesRetentionCheck) {
    const retentionResult = await enforceRetention('values', valuesRevisions);
    rowsPruned += retentionResult.pruned;
    hasMoreWork = hasMoreWork || retentionResult.hasMoreWork;
  }

  return {
    status: 'completed',
    streamsInspected: 2,
    runsConsolidated,
    rowsPruned,
    malformedStreams,
    hasMoreWork,
  };
}
