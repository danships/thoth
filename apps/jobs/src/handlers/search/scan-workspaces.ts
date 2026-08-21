import { getWorkspaceRepository } from '@thoth/database';
import {
  searchReconcileWorkspaceDedupeKey,
  searchScanWorkspacesPayloadV1Schema,
  type JobDefinition,
  type JobExecutionContext,
  type SearchScanWorkspacesPayloadV1,
} from '@thoth/job-protocol';

const SCAN_BATCH_SIZE = 100;

type CursorLike = { createdAt: string; id: string };

function compareCursor(left: CursorLike, right: CursorLike): number {
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }
  return left.id.localeCompare(right.id);
}

export const searchScanWorkspacesJobDefinition: JobDefinition<SearchScanWorkspacesPayloadV1> = {
  type: 'search.scan-workspaces',
  payloadVersion: 1,
  payloadSchema: searchScanWorkspacesPayloadV1Schema,
  priority: 3,
  maxAttempts: 3,
  handler: async (context: JobExecutionContext<SearchScanWorkspacesPayloadV1>) => {
    const workspaceRepository = await getWorkspaceRepository();
    const workspaces = (await workspaceRepository.getByQuery(workspaceRepository.createQuery()))
      .filter((workspace) => workspace.deletedAt === null)
      .sort(compareCursor);

    const startIndex = context.payload.cursor
      ? workspaces.findIndex((workspace) => compareCursor(workspace, context.payload.cursor!) > 0)
      : 0;
    const normalizedStartIndex = startIndex === -1 ? workspaces.length : startIndex;
    const batch = workspaces.slice(normalizedStartIndex, normalizedStartIndex + SCAN_BATCH_SIZE);

    for (const workspace of batch) {
      await context.enqueueChild({
        type: 'search.reconcile-workspace',
        payloadVersion: 1,
        payload: { workspaceId: workspace.id },
        dedupeKey: searchReconcileWorkspaceDedupeKey({ workspaceId: workspace.id }),
      });
    }

    const hasMore = normalizedStartIndex + batch.length < workspaces.length;
    if (hasMore && batch.length > 0) {
      await context.enqueueChild({
        type: 'search.scan-workspaces',
        payloadVersion: 1,
        payload: {
          cursor: {
            createdAt: batch.at(-1)!.createdAt,
            id: batch.at(-1)!.id,
          },
        },
      });
    }

    return {
      workspacesScanned: batch.length,
      workspacesEnqueued: batch.length,
      continued: hasMore,
    };
  },
};
