import { apiRoute } from '@/lib/api/route-wrapper';
import { permanentlyDeleteManyByIds } from '@/lib/database/soft-delete-service';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { scheduleWorkspaceSearchReconcile } from '@/lib/search/notify-service';
import type { BatchDeletePagesBody, BatchDeletePagesResponse } from '@/types/api';
import { batchTrashBodySchema } from '@/types/api';

export const POST = apiRoute<BatchDeletePagesResponse, undefined, {}, BatchDeletePagesBody>(
  {
    expectedBodySchema: batchTrashBodySchema,
    disallowApiKey: true,
  },
  async ({ body }, session) => {
    const workspaceIdByPageId = new Map<string, string>();
    for (const pageId of body.ids) {
      try {
        const page = await pageRetriever.retrievePageIncludingDeleted(pageId, session.user.id);
        workspaceIdByPageId.set(pageId, page.workspaceId);
      } catch {
        // The batch service below decides which ids are actually deletable; only successful ones
        // are scheduled for reconcile.
      }
    }

    const result = await permanentlyDeleteManyByIds(body.ids, session.user.id);
    const workspaceIds = new Set(
      result.deleted
        .map((pageId) => workspaceIdByPageId.get(pageId))
        .filter((workspaceId): workspaceId is string => workspaceId !== undefined)
    );

    for (const workspaceId of workspaceIds) {
      scheduleWorkspaceSearchReconcile(workspaceId);
    }

    return result;
  }
);
