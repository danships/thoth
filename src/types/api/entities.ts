import { dataViewSchema as dataViewSchemaEntity } from '../schemas/entities/data-view';
import { pageContainerSchema, dataSourceContainerSchema, pageCoverSchema } from '../schemas/entities/container';
import { containerAccessSchema as containerAccessSchemaEntity } from '../schemas/entities/container-access';
import { workspaceSchema as workspaceSchemaEntity } from '../schemas/entities/workspace';
import { appSchema as appSchemaEntity } from '../schemas/entities/app';
import { apiKeyPublicSchema as apiKeyPublicSchemaEntity } from '../schemas/entities/api-key';
import { webhookPublicSchema as webhookPublicSchemaEntity } from '../schemas/entities/webhook';
import { webhookDeliverySchema as webhookDeliverySchemaEntity } from '../schemas/entities/webhook-delivery';
import { z } from 'zod';

export { pageCoverSchema } from '../schemas/entities/container';
export type PageCover = z.infer<typeof pageCoverSchema>;

export const pageSchema = pageContainerSchema
  .pick({
    id: true,
    name: true,
    createdAt: true,
    lastUpdated: true,
    emoji: true,
    cover: true,
    parentId: true,
    sortOrder: true,
  })
  .meta({ id: 'Page' });
export type Page = z.infer<typeof pageSchema>;

export const pageCreateSchema = pageSchema.omit({ id: true });

export const dataViewSchema = dataViewSchemaEntity
  .pick({
    id: true,
    name: true,
    lastUpdated: true,
    createdAt: true,
    dataSourceId: true,
    filters: true,
    sorts: true,
  })
  .meta({ id: 'DataView' });
export type DataView = z.infer<typeof dataViewSchema>;

export const dataSourceSchema = dataSourceContainerSchema
  .pick({
    id: true,
    name: true,
    createdAt: true,
    lastUpdated: true,
    columns: true,
  })
  .meta({ id: 'DataSource' });
export type DataSource = z.infer<typeof dataSourceSchema>;

export const containerAccessSchema = containerAccessSchemaEntity
  .pick({
    id: true,
    containerId: true,
    parentId: true,
    lastAccessedAt: true,
  })
  .meta({ id: 'ContainerAccess' });
export type ContainerAccessApi = z.infer<typeof containerAccessSchema>;

export const workspaceSchema = workspaceSchemaEntity
  .pick({
    id: true,
    name: true,
    slug: true,
    createdAt: true,
    lastUpdated: true,
    storageQuotaBytes: true,
  })
  .meta({ id: 'Workspace' });
export type WorkspaceApi = z.infer<typeof workspaceSchema>;

// API-facing representation of an "App" (see THOTH-026): never includes any key secret — a
// key is minted separately via `POST /apps/:id/keys` (see `apiKeySchema` below).
export const appSchema = appSchemaEntity
  .pick({
    id: true,
    workspaceId: true,
    label: true,
    permission: true,
    scopeType: true,
    attributionMode: true,
    archivedAt: true,
    createdAt: true,
    lastUpdated: true,
  })
  .meta({ id: 'App' });
export type AppApi = z.infer<typeof appSchema>;

// API-facing representation of a key: never includes `keyHash` (internal only) or the raw
// secret (returned exactly once, at mint time, as `secret` on `CreateApiKeyResponse`).
export const apiKeySchema = apiKeyPublicSchemaEntity
  .pick({
    id: true,
    appId: true,
    label: true,
    keyPrefix: true,
    expiresAt: true,
    lastUsedAt: true,
    revokedAt: true,
    createdAt: true,
  })
  .meta({ id: 'ApiKey' });
export type ApiKeyApi = z.infer<typeof apiKeySchema>;

// API-facing representation of a Webhook (see THOTH-031): never includes the raw `secret` —
// callers get a masked form (`secretMasked`, attached in `WebhookResponse`) plus the raw value
// only once, on create/rotate.
export const webhookSchema = webhookPublicSchemaEntity
  .pick({
    id: true,
    appId: true,
    workspaceId: true,
    label: true,
    url: true,
    enabled: true,
    suppressOwnChanges: true,
    createdAt: true,
    lastUpdated: true,
  })
  .meta({ id: 'Webhook' });
export type WebhookApi = z.infer<typeof webhookSchema>;

// API-facing representation of a delivery-attempt history row: never includes the stored
// `payload` (kept internal for verbatim resend) or the `webhookId`/`appId` FKs (implied by the
// route path).
export const webhookDeliverySchema = webhookDeliverySchemaEntity
  .pick({
    id: true,
    event: true,
    containerId: true,
    status: true,
    httpStatus: true,
    error: true,
    attempts: true,
    createdAt: true,
    lastAttemptAt: true,
  })
  .meta({ id: 'WebhookDelivery' });
export type WebhookDeliveryApi = z.infer<typeof webhookDeliverySchema>;
