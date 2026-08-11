import { z } from 'zod';
import { pageContainerSchema, dataSourceContainerSchema } from './schemas/entities/container';
import { containerAccessSchema } from './schemas/entities/container-access';
import { workspaceSchema as workspaceSchemaEntity } from './schemas/entities/workspace';
import { workspaceMemberSchema } from './schemas/entities/workspace-member';
import { workspaceSlugRedirectSchema } from './schemas/entities/workspace-slug-redirect';
import { dataViewSchema } from './schemas/entities/data-view';
import { appSchema } from './schemas/entities/app';
import { apiKeySchema, apiKeyPublicSchema } from './schemas/entities/api-key';
import { appScopedContainerSchema } from './schemas/entities/app-scoped-container';
import { memberScopedContainerSchema } from './schemas/entities/member-scoped-container';
import { webhookSchema } from './schemas/entities/webhook';
import { webhookDeliverySchema } from './schemas/entities/webhook-delivery';
import { uploadedFileSchema } from './schemas/entities/uploaded-file';
import { fileUsageSchema } from './schemas/entities/file-usage';
import { pageRevisionSchema } from './schemas/entities/page-revision';
import { settingSchema } from './schemas/entities/setting';
import { platformUserSchema } from './schemas/entities/platform-user';

/** Container Entity Schema */
export { pageContainerSchema, dataSourceContainerSchema } from './schemas/entities/container';
export const pageContainerCreateSchema = pageContainerSchema.omit({ id: true });
export type PageContainer = z.infer<typeof pageContainerSchema>;
export type PageContainerCreate = z.infer<typeof pageContainerCreateSchema>;

export const dataSourceContainerCreateSchema = dataSourceContainerSchema.omit({ id: true });
export type DataSourceContainer = z.infer<typeof dataSourceContainerSchema>;
export type DataSourceContainerCreate = z.infer<typeof dataSourceContainerCreateSchema>;

export const containerCreateSchema = pageContainerSchema.omit({ id: true });

export const containerSchema = z.discriminatedUnion('type', [pageContainerSchema, dataSourceContainerSchema]);

export type Container = z.infer<typeof containerSchema>;
export type ContainerCreate = z.infer<typeof containerCreateSchema>;

/** End Container Entity Schema */

/** Workspace Entity Schema */
export { workspaceSchema } from './schemas/entities/workspace';

export const workspaceCreateSchema = workspaceSchemaEntity.omit({ id: true });

export type Workspace = z.infer<typeof workspaceSchemaEntity>;
export type WorkspaceCreate = z.infer<typeof workspaceCreateSchema>;
/** End Workspace Entity Schema */

/** DataView Entity Schema */
export { dataViewSchema } from './schemas/entities/data-view';

export const dataViewCreateSchema = dataViewSchema.omit({ id: true });

export type DataView = z.infer<typeof dataViewSchema>;
export type DataViewCreate = z.infer<typeof dataViewCreateSchema>;
/** End DataView Entity Schema */

/** ContainerAccess Entity Schema */
export { containerAccessSchema } from './schemas/entities/container-access';

export const containerAccessCreateSchema = containerAccessSchema.omit({ id: true });

export type ContainerAccess = z.infer<typeof containerAccessSchema>;
export type ContainerAccessCreate = z.infer<typeof containerAccessCreateSchema>;
/** End ContainerAccess Entity Schema */

/** WorkspaceMember Entity Schema */
export { workspaceMemberSchema } from './schemas/entities/workspace-member';

export const workspaceMemberCreateSchema = workspaceMemberSchema.omit({ id: true });

export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type WorkspaceMemberCreate = z.infer<typeof workspaceMemberCreateSchema>;
/** End WorkspaceMember Entity Schema */

/** WorkspaceSlugRedirect Entity Schema */
export { workspaceSlugRedirectSchema } from './schemas/entities/workspace-slug-redirect';

export const workspaceSlugRedirectCreateSchema = workspaceSlugRedirectSchema.omit({ id: true });

export type WorkspaceSlugRedirect = z.infer<typeof workspaceSlugRedirectSchema>;
export type WorkspaceSlugRedirectCreate = z.infer<typeof workspaceSlugRedirectCreateSchema>;
/** End WorkspaceSlugRedirect Entity Schema */

/** App Entity Schema */
export { appSchema, appAttributionModeSchema, appPermissionSchema, appScopeTypeSchema } from './schemas/entities/app';
export type { AppAttributionMode, AppPermission, AppScopeType } from './schemas/entities/app';

export const appCreateSchema = appSchema.omit({ id: true });

export type App = z.infer<typeof appSchema>;
export type AppCreate = z.infer<typeof appCreateSchema>;
/** End App Entity Schema */

/** ApiKey Entity Schema */
export { apiKeySchema, apiKeyPublicSchema } from './schemas/entities/api-key';

export const apiKeyCreateSchema = apiKeySchema.omit({ id: true });

export type ApiKey = z.infer<typeof apiKeySchema>;
export type ApiKeyCreate = z.infer<typeof apiKeyCreateSchema>;
export type ApiKeyPublic = z.infer<typeof apiKeyPublicSchema>;
/** End ApiKey Entity Schema */

/** AppScopedContainer Entity Schema */
export { appScopedContainerSchema } from './schemas/entities/app-scoped-container';

export const appScopedContainerCreateSchema = appScopedContainerSchema.omit({ id: true });

export type AppScopedContainer = z.infer<typeof appScopedContainerSchema>;
export type AppScopedContainerCreate = z.infer<typeof appScopedContainerCreateSchema>;
/** End AppScopedContainer Entity Schema */

/** MemberScopedContainer Entity Schema */
export { memberScopedContainerSchema } from './schemas/entities/member-scoped-container';

export const memberScopedContainerCreateSchema = memberScopedContainerSchema.omit({ id: true });

export type MemberScopedContainer = z.infer<typeof memberScopedContainerSchema>;
export type MemberScopedContainerCreate = z.infer<typeof memberScopedContainerCreateSchema>;
/** End MemberScopedContainer Entity Schema */

/** Webhook Entity Schema */
export { webhookSchema, webhookPublicSchema, webhookUrlSchema } from './schemas/entities/webhook';

export const webhookCreateSchema = webhookSchema.omit({ id: true });

export type Webhook = z.infer<typeof webhookSchema>;
export type WebhookCreate = z.infer<typeof webhookCreateSchema>;
/** End Webhook Entity Schema */

/** WebhookDelivery Entity Schema */
export {
  webhookDeliverySchema,
  webhookPayloadSchema,
  webhookDeliveryEventSchema,
  webhookDeliveryStatusSchema,
  webhookRawValueSchema,
} from './schemas/entities/webhook-delivery';
export type {
  WebhookPayload,
  WebhookDeliveryEvent,
  WebhookDeliveryStatus,
  WebhookRawValue,
} from './schemas/entities/webhook-delivery';

export const webhookDeliveryCreateSchema = webhookDeliverySchema.omit({ id: true });

export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;
export type WebhookDeliveryCreate = z.infer<typeof webhookDeliveryCreateSchema>;
/** End WebhookDelivery Entity Schema */

/** UploadedFile Entity Schema */
export { uploadedFileSchema } from './schemas/entities/uploaded-file';

export const uploadedFileCreateSchema = uploadedFileSchema.omit({ id: true });

export type UploadedFile = z.infer<typeof uploadedFileSchema>;
export type UploadedFileCreate = z.infer<typeof uploadedFileCreateSchema>;
/** End UploadedFile Entity Schema */

/** FileUsage Entity Schema */
export { fileUsageSchema } from './schemas/entities/file-usage';

export const fileUsageCreateSchema = fileUsageSchema.omit({ id: true });

export type FileUsage = z.infer<typeof fileUsageSchema>;
export type FileUsageCreate = z.infer<typeof fileUsageCreateSchema>;
/** End FileUsage Entity Schema */

/** PageRevision Entity Schema */
export {
  pageRevisionSchema,
  pageRevisionKindSchema,
  pageRevisionTargetSchema,
} from './schemas/entities/page-revision';
export type { PageRevisionKind, PageRevisionTarget } from './schemas/entities/page-revision';

export const pageRevisionCreateSchema = pageRevisionSchema.omit({ id: true });

export type PageRevision = z.infer<typeof pageRevisionSchema>;
export type PageRevisionCreate = z.infer<typeof pageRevisionCreateSchema>;
/** End PageRevision Entity Schema */

/** Setting Entity Schema */
export { settingSchema, settingScopeSchema } from './schemas/entities/setting';
export type { SettingScope } from './schemas/entities/setting';

export const settingCreateSchema = settingSchema.omit({ id: true });

export type Setting = z.infer<typeof settingSchema>;
export type SettingCreate = z.infer<typeof settingCreateSchema>;
/** End Setting Entity Schema */

/** PlatformUser Entity Schema */
export { platformUserSchema, platformUserRoleSchema } from './schemas/entities/platform-user';
export type { PlatformUserRole } from './schemas/entities/platform-user';

export const platformUserCreateSchema = platformUserSchema.omit({ id: true });

export type PlatformUser = z.infer<typeof platformUserSchema>;
export type PlatformUserCreate = z.infer<typeof platformUserCreateSchema>;
/** End PlatformUser Entity Schema */
