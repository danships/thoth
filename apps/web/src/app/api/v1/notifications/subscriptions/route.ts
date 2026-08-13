import { getCanonicalRulesForUser } from '@thoth/database';
import { apiRoute } from '@/lib/api/route-wrapper';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { getMemberWorkspaceIds } from '@/lib/notifications/member-workspaces';
import { toNotificationRuleResponse } from '@/lib/notifications/notification-response';
import type { GetNotificationSubscriptionsQuery, GetNotificationSubscriptionsResponse } from '@/types/api';
import { getNotificationSubscriptionsQuerySchema } from '@/types/api';

// List the caller's canonical subscription/exclusion rules (THOTH-066), optionally scoped to one
// membership-checked workspace, else across all current memberships.
export const GET = apiRoute<GetNotificationSubscriptionsResponse, GetNotificationSubscriptionsQuery, {}, {}>(
  {
    disallowApiKey: true,
    expectedQuerySchema: getNotificationSubscriptionsQuerySchema,
  },
  async ({ query }, session) => {
    if (query.workspaceId) {
      await assertWorkspaceAccess(session.user.id, query.workspaceId);
      const rules = await getCanonicalRulesForUser(session.user.id, query.workspaceId);
      return { subscriptions: rules.map((rule) => toNotificationRuleResponse(rule)) };
    }

    const workspaceIds = await getMemberWorkspaceIds(session.user.id);
    const all = [];
    for (const workspaceId of workspaceIds) {
      const rules = await getCanonicalRulesForUser(session.user.id, workspaceId);
      all.push(...rules.map((rule) => toNotificationRuleResponse(rule)));
    }
    return { subscriptions: all };
  }
);
