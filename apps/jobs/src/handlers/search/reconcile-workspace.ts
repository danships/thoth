import {
  searchReconcileWorkspaceDedupeKey,
  searchReconcileWorkspacePayloadV1Schema,
  type JobDefinition,
  type JobExecutionContext,
  type SearchReconcileWorkspacePayloadV1,
} from '@thoth/job-protocol';
import { getSearchService } from '../../search/search-context.js';

export const searchReconcileWorkspaceJobDefinition: JobDefinition<SearchReconcileWorkspacePayloadV1> = {
  type: 'search.reconcile-workspace',
  payloadVersion: 1,
  payloadSchema: searchReconcileWorkspacePayloadV1Schema,
  priority: 3,
  maxAttempts: 3,
  dedupeKey: searchReconcileWorkspaceDedupeKey,
  handler: async (context: JobExecutionContext<SearchReconcileWorkspacePayloadV1>) => {
    const result = await getSearchService().reconcileWorkspace(context.payload.workspaceId, context.payload.cursor);

    if (result.nextCursor) {
      await context.enqueueChild({
        type: 'search.reconcile-workspace',
        payloadVersion: 1,
        payload: {
          workspaceId: context.payload.workspaceId,
          cursor: result.nextCursor,
        },
        dedupeKey: searchReconcileWorkspaceDedupeKey({ workspaceId: context.payload.workspaceId }),
      });
    }

    return result;
  },
};
