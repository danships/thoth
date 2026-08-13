import { getWorkspaceRepository } from '../../repositories.js';
import type { Workspace } from '../../types.js';
import { isOutsideRaceSafetyMargin, isPastGraceThreshold } from './grace.js';
import { cascadeDeleteWorkspace, type WorkspaceCascadeCounts, type WorkspaceCascadeOptions } from './workspace-cascade.js';

export type WorkspacePurgeBatch = {
  /** Candidates eligible for this execution, bounded by `limit`. */
  candidates: Workspace[];
  /** Total number of eligible (grace-expired, outside race margin) workspaces at scan time. */
  totalEligible: number;
};

/**
 * Selects up to `limit` soft-deleted workspaces past `graceThresholdMs` and outside the
 * 1-hour race-safety margin, skipping `offset` such candidates first (used by a continuation to
 * resume past ones already processed — including ones deliberately skipped — within one bounded
 * execution chain; a fresh scheduled occurrence always starts at `offset: 0`).
 */
export async function selectPurgeableWorkspaces(options: {
  graceThresholdMs: number;
  nowMs: number;
  limit: number;
  offset: number;
}): Promise<WorkspacePurgeBatch> {
  const workspaceRepository = await getWorkspaceRepository();
  // SuperSave has no `deletedAt IS NOT NULL` filter primitive, so every soft-deleted workspace
  // is loaded and filtered in memory — mirrors the pre-extraction script's behaviour exactly.
  const all = await workspaceRepository.getByQuery(workspaceRepository.createQuery());

  const eligible = all.filter(
    (workspace) =>
      isPastGraceThreshold(workspace.deletedAt, options.graceThresholdMs) &&
      isOutsideRaceSafetyMargin(workspace.lastUpdated, options.nowMs)
  );

  return {
    candidates: eligible.slice(options.offset, options.offset + options.limit),
    totalEligible: eligible.length,
  };
}

/**
 * Re-fetches a workspace by id immediately before its cascade is executed and re-validates it is
 * still soft-deleted and still past the grace threshold. `undefined` means "skip this
 * candidate" — restored, hard-deleted from under us, or (defensively) a malformed timestamp.
 */
export async function revalidateWorkspaceForPurge(
  workspaceId: string,
  graceThresholdMs: number
): Promise<Workspace | undefined> {
  const workspaceRepository = await getWorkspaceRepository();
  const revalidated = await workspaceRepository.getOneByQuery(
    workspaceRepository.createQuery().eq('id', workspaceId)
  );
  if (!revalidated || !isPastGraceThreshold(revalidated.deletedAt, graceThresholdMs)) {
    return undefined;
  }
  return revalidated;
}

export type WorkspacePurgeOutcome =
  | { status: 'purged'; counts: WorkspaceCascadeCounts }
  | { status: 'skipped'; reason: 'restored-or-missing' };

/** Revalidates then (if still eligible) cascade-deletes a single workspace. */
export async function purgeWorkspace(
  workspaceId: string,
  graceThresholdMs: number,
  cascadeOptions: WorkspaceCascadeOptions = {}
): Promise<WorkspacePurgeOutcome> {
  const revalidated = await revalidateWorkspaceForPurge(workspaceId, graceThresholdMs);
  if (!revalidated) {
    return { status: 'skipped', reason: 'restored-or-missing' };
  }
  const counts = await cascadeDeleteWorkspace(revalidated.id, cascadeOptions);
  return { status: 'purged', counts };
}
