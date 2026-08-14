import { z } from 'zod';
import { notificationRuleKindSchema } from '@thoth/database/types';
import type { DataWrapper } from '../utilities';

// Public representation of one canonical `notification-rule` (THOTH-066). `containerId` is
// `null` for the workspace-level rule and a page id for page/tree/exclude rules.
export const notificationRuleResponseSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    containerId: z.string().nullable(),
    kind: notificationRuleKindSchema,
    createdAt: z.string(),
    lastUpdated: z.string(),
  })
  .meta({ id: 'NotificationRule' });
export type NotificationRuleResponse = z.infer<typeof notificationRuleResponseSchema>;
export type NotificationRuleResponseData = DataWrapper<NotificationRuleResponse>;

const notificationSubscriptionsResponseSchema = z.object({
  subscriptions: z.array(notificationRuleResponseSchema),
});
export type NotificationSubscriptionsResponse = z.infer<typeof notificationSubscriptionsResponseSchema>;
export type NotificationSubscriptionsResponseData = DataWrapper<NotificationSubscriptionsResponse>;

/** GET /notifications/subscriptions */
export const getNotificationSubscriptionsQuerySchema = z.object({
  workspaceId: z.string().min(1).optional(),
});
export type GetNotificationSubscriptionsQuery = z.infer<typeof getNotificationSubscriptionsQuerySchema>;

export const getNotificationSubscriptionsResponseSchema = notificationSubscriptionsResponseSchema;
export type GetNotificationSubscriptionsResponse = z.infer<typeof getNotificationSubscriptionsResponseSchema>;
export type GetNotificationSubscriptionsResponseData = DataWrapper<GetNotificationSubscriptionsResponse>;

/** PUT /notifications/subscriptions/workspaces/{workspaceId} */
export const putWorkspaceNotificationSubscriptionParametersSchema = z.object({
  workspaceId: z.string().min(1),
});
export type PutWorkspaceNotificationSubscriptionParameters = z.infer<
  typeof putWorkspaceNotificationSubscriptionParametersSchema
>;

export const putWorkspaceNotificationSubscriptionBodySchema = z.object({
  kind: z.enum(['workspace', 'none']),
});
export type PutWorkspaceNotificationSubscriptionBody = z.infer<typeof putWorkspaceNotificationSubscriptionBodySchema>;

export const putWorkspaceNotificationSubscriptionResponseSchema = notificationSubscriptionsResponseSchema;
export type PutWorkspaceNotificationSubscriptionResponse = z.infer<
  typeof putWorkspaceNotificationSubscriptionResponseSchema
>;
export type PutWorkspaceNotificationSubscriptionResponseData =
  DataWrapper<PutWorkspaceNotificationSubscriptionResponse>;

/** PUT /notifications/subscriptions/pages/{pageId} */
export const putPageNotificationSubscriptionParametersSchema = z.object({
  pageId: z.string().min(1),
});
export type PutPageNotificationSubscriptionParameters = z.infer<typeof putPageNotificationSubscriptionParametersSchema>;

export const putPageNotificationSubscriptionBodySchema = z.object({
  kind: z.enum(['page', 'tree', 'exclude_page', 'exclude_tree', 'none']),
});
export type PutPageNotificationSubscriptionBody = z.infer<typeof putPageNotificationSubscriptionBodySchema>;

export const putPageNotificationSubscriptionResponseSchema = notificationSubscriptionsResponseSchema;
export type PutPageNotificationSubscriptionResponse = z.infer<typeof putPageNotificationSubscriptionResponseSchema>;
export type PutPageNotificationSubscriptionResponseData = DataWrapper<PutPageNotificationSubscriptionResponse>;
