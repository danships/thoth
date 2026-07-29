import { dataViewSchema as dataViewSchemaEntity } from '../schemas/entities/data-view';
import { pageContainerSchema, dataSourceContainerSchema, pageCoverSchema } from '../schemas/entities/container';
import { containerAccessSchema as containerAccessSchemaEntity } from '../schemas/entities/container-access';
import { workspaceSchema as workspaceSchemaEntity } from '../schemas/entities/workspace';
import { appSchema as appSchemaEntity } from '../schemas/entities/app';
import { apiKeyPublicSchema as apiKeyPublicSchemaEntity } from '../schemas/entities/api-key';
import { z } from 'zod';

export { pageCoverSchema } from '../schemas/entities/container';
export type PageCover = z.infer<typeof pageCoverSchema>;

export const pageSchema = pageContainerSchema.pick({
  id: true,
  name: true,
  createdAt: true,
  lastUpdated: true,
  emoji: true,
  cover: true,
  parentId: true,
});
export type Page = z.infer<typeof pageSchema>;

export const pageCreateSchema = pageSchema.omit({ id: true });

export const dataViewSchema = dataViewSchemaEntity.pick({
  id: true,
  name: true,
  lastUpdated: true,
  createdAt: true,
  dataSourceId: true,
});
export type DataView = z.infer<typeof dataViewSchema>;

export const dataSourceSchema = dataSourceContainerSchema.pick({
  id: true,
  name: true,
  createdAt: true,
  lastUpdated: true,
  columns: true,
});
export type DataSource = z.infer<typeof dataSourceSchema>;

export const containerAccessSchema = containerAccessSchemaEntity.pick({
  id: true,
  containerId: true,
  parentId: true,
  lastAccessedAt: true,
});
export type ContainerAccessApi = z.infer<typeof containerAccessSchema>;

export const workspaceSchema = workspaceSchemaEntity.pick({
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  lastUpdated: true,
});
export type WorkspaceApi = z.infer<typeof workspaceSchema>;

// API-facing representation of an "App" (see THOTH-026): never includes any key secret — a
// key is minted separately via `POST /apps/:id/keys` (see `apiKeySchema` below).
export const appSchema = appSchemaEntity.pick({
  id: true,
  workspaceId: true,
  label: true,
  permission: true,
  scopeType: true,
  attributionMode: true,
  archivedAt: true,
  createdAt: true,
  lastUpdated: true,
});
export type AppApi = z.infer<typeof appSchema>;

// API-facing representation of a key: never includes `keyHash` (internal only) or the raw
// secret (returned exactly once, at mint time, as `secret` on `CreateApiKeyResponse`).
export const apiKeySchema = apiKeyPublicSchemaEntity.pick({
  id: true,
  appId: true,
  label: true,
  keyPrefix: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
});
export type ApiKeyApi = z.infer<typeof apiKeySchema>;
