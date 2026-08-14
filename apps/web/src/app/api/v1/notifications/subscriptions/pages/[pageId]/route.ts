import { getCanonicalRulesForUser, upsertNotificationRule } from '@thoth/database';
import { apiRoute } from '@/lib/api/route-wrapper';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { toNotificationRuleResponse } from '@/lib/notifications/notification-response';
import type {
  PutPageNotificationSubscriptionBody,
  PutPageNotificationSubscriptionParameters,
  PutPageNotificationSubscriptionResponse,
} from '@/types/api';
import {
  putPageNotificationSubscriptionBodySchema,
  putPageNotificationSubscriptionParametersSchema,
} from '@/types/api';

// Set (or, with `kind: 'none'`, clear) a page-scoped subscription/exclusion rule (THOTH-066).
// `pageRetriever.retrievePage` asserts current membership on the page's OWN workspace (404
// existence-hiding for an unknown page or a non-member) before the rule is written.
export const PUT = apiRoute<
  PutPageNotificationSubscriptionResponse,
  {},
  PutPageNotificationSubscriptionParameters,
  PutPageNotificationSubscriptionBody
>(
  {
    disallowApiKey: true,
    expectedParamsSchema: putPageNotificationSubscriptionParametersSchema,
    expectedBodySchema: putPageNotificationSubscriptionBodySchema,
  },
  async ({ params, body }, session) => {
    const page = await pageRetriever.retrievePage(params.pageId, session.user.id);

    await upsertNotificationRule({
      userId: session.user.id,
      workspaceId: page.workspaceId,
      containerId: page.id,
      kind: body.kind,
    });

    const rules = await getCanonicalRulesForUser(session.user.id, page.workspaceId);
    return { subscriptions: rules.map((rule) => toNotificationRuleResponse(rule)) };
  }
);
