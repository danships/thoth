import { apiRoute } from '@/lib/api/route-wrapper';
import { restoreManyByIds } from '@/lib/database/soft-delete-service';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { getLogger } from '@/lib/logger';
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

    // Reconciliation below is best-effort bookkeeping and must never change the response of the
    // already-committed restore above: a page unreachable for this caller (e.g. outside their
    // grant) must not fail the whole request or stop later pages in `result.restored` from being
    // reconciled.
    for (const restoredPageId of result.restored) {
      try {
        const restoredPage = await pageRetriever.retrievePage(restoredPageId, session.user.id);
        workspaceIds.add(restoredPage.workspaceId);
      } catch (error) {
        const logger = await getLogger();
        logger.warn('pages.batch-restore.workspace-lookup-failed', { pageId: restoredPageId, error });
      }
    }

    for (const workspaceId of workspaceIds) {
      scheduleWorkspaceSearchReconcile(workspaceId);
    }

    return result;
  }
);
