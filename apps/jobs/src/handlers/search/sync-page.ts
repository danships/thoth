import {
  searchSyncPageDedupeKey,
  searchSyncPagePayloadV1Schema,
  type JobDefinition,
  type JobExecutionContext,
  type SearchSyncPagePayloadV1,
} from '@thoth/job-protocol';
import { getSearchService } from '../../search/search-context.js';

export const searchSyncPageJobDefinition: JobDefinition<SearchSyncPagePayloadV1> = {
  type: 'search.sync-page',
  payloadVersion: 1,
  payloadSchema: searchSyncPagePayloadV1Schema,
  priority: 4,
  maxAttempts: 5,
  dedupeKey: searchSyncPageDedupeKey,
  handler: async (context: JobExecutionContext<SearchSyncPagePayloadV1>) => {
    return getSearchService().syncPage({
      workspaceId: context.payload.workspaceId,
      pageId: context.payload.pageId,
    });
  },
};
