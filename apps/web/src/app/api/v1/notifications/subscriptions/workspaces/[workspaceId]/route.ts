import { getCanonicalRulesForUser, upsertNotificationRule } from '@thoth/database';
import { apiRoute } from '@/lib/api/route-wrapper';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { toNotificationRuleResponse } from '@/lib/notifications/notification-response';
import type {
  PutWorkspaceNotificationSubscriptionBody,
  PutWorkspaceNotificationSubscriptionParameters,
  PutWorkspaceNotificationSubscriptionResponse,
} from '@/types/api';
import {
  putWorkspaceNotificationSubscriptionBodySchema,
  putWorkspaceNotificationSubscriptionParametersSchema,
} from '@/types/api';

// Set (or, with `kind: 'none'`, clear) the workspace-level subscription rule (THOTH-066). The
// workspace rule is the canonical `containerId: null` row. Membership-checked.
export const PUT = apiRoute<
  PutWorkspaceNotificationSubscriptionResponse,
  {},
  PutWorkspaceNotificationSubscriptionParameters,
  PutWorkspaceNotificationSubscriptionBody
>(
  {
    disallowApiKey: true,
    expectedParamsSchema: putWorkspaceNotificationSubscriptionParametersSchema,
    expectedBodySchema: putWorkspaceNotificationSubscriptionBodySchema,
  },
  async ({ params, body }, session) => {
    await assertWorkspaceAccess(session.user.id, params.workspaceId);

    await upsertNotificationRule({
      userId: session.user.id,
      workspaceId: params.workspaceId,
      containerId: null,
      kind: body.kind,
    });

    const rules = await getCanonicalRulesForUser(session.user.id, params.workspaceId);
    return { subscriptions: rules.map((rule) => toNotificationRuleResponse(rule)) };
  }
);
