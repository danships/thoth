import { apiRoute } from '@/lib/api/route-wrapper';
import { restoreManyByIds } from '@/lib/database/soft-delete-service';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { scheduleWorkspaceSearchReconcile } from '@/lib/search/notify-service';
import type { BatchRestorePagesResponse, BatchTrashBody } from '@/types/api';
import { batchTrashBodySchema } from '@/types/api';

export const POST = apiRoute<BatchRestorePagesResponse, undefined, {}, BatchTrashBody>(
  {
    expectedBodySchema: batchTrashBodySchema,
    disallowApiKey: true,
  },
  async ({ body }, session) => {
    const result = await restoreManyByIds(body.ids, session.user.id);
    const workspaceIds = new Set<string>();

    for (const restoredPageId of result.restored) {
      const restoredPage = await pageRetriever.retrievePage(restoredPageId, session.user.id);
      workspaceIds.add(restoredPage.workspaceId);
    }

    for (const workspaceId of workspaceIds) {
      scheduleWorkspaceSearchReconcile(workspaceId);
    }

    return result;
  }
);
