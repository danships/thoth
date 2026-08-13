import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { scheduleNotifyPageChange } from '@/lib/webhooks/notify-service';
import { toWebhookActor } from '@/lib/webhooks/actor';
import { extractFileIdsFromContent, syncFileUsageForPage } from '@/lib/files/usage';
import { getLogger } from '@/lib/logger';
import { recordContentRevision } from '@thoth/database';
import {
  GetPageContentParameters,
  getPageContentParametersSchema,
  GetPageContentResponse,
} from '@/types/api/endpoints/get-page-content';
import { setPageContentBodySchema, setPageContentParametersSchema } from '@/types/api/endpoints/set-page-content';

export const GET = apiRoute<GetPageContentResponse, undefined, GetPageContentParameters>(
  {
    expectedParamsSchema: getPageContentParametersSchema,
  },
  async ({ params }, session): Promise<GetPageContentResponse> => {
    const page = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page);

    return {
      content: 'content' in page ? (page.content ?? '') : '',
    };
  }
);

export const POST = apiRoute(
  {
    expectedBodySchema: setPageContentBodySchema,
    expectedParamsSchema: setPageContentParametersSchema,
  },
  async ({ params, body }, session) => {
    const containerRepository = await getContainerRepository();

    const page = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page, { mutating: true });

    // Record the revision against the *pre-update* content, before the container row itself is
    // overwritten below. Skipped entirely when the content hasn't actually changed, so a no-op
    // save doesn't add an empty entry to the timeline or consume the `MAX_REVISIONS` budget.
    if (body.content !== (page.content ?? '')) {
      await recordContentRevision({ page, newContent: body.content, author: session.user.id });
    }

    const updatedPage = await containerRepository.update({
      ...page,
      content: body.content,
      lastUpdated: new Date().toISOString(),
    });

    // Reconcile file usage after the content is durably persisted. A failure here shouldn't fail
    // the whole request or skip the change notification — log and continue.
    try {
      await syncFileUsageForPage(params.id, session, extractFileIdsFromContent(body.content));
    } catch (error) {
      const logger = await getLogger();
      logger.error('pages.set-content.sync-file-usage-failed', { pageId: params.id, error });
    }

    scheduleNotifyPageChange('page.updated', updatedPage, toWebhookActor(session));
  }
);
