import { z } from 'zod';
import { pageContainerSchema, dataSourceContainerSchema } from '../schemas/entities/container';
import { containerAccessSchema } from '../schemas/entities/container-access';
import { workspaceSchema as workspaceSchemaEntity } from '../schemas/entities/workspace';
import { workspaceMemberSchema } from '../schemas/entities/workspace-member';
import { workspaceSlugRedirectSchema } from '../schemas/entities/workspace-slug-redirect';
import { dataViewSchema } from '../schemas/entities/data-view';

/** Container Entity Schema */
export { pageContainerSchema, dataSourceContainerSchema } from '../schemas/entities/container';
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
export { workspaceSchema } from '../schemas/entities/workspace';

export const workspaceCreateSchema = workspaceSchemaEntity.omit({ id: true });

export type Workspace = z.infer<typeof workspaceSchemaEntity>;
export type WorkspaceCreate = z.infer<typeof workspaceCreateSchema>;
/** End Workspace Entity Schema */

/** DataView Entity Schema */
export { dataViewSchema } from '../schemas/entities/data-view';

export const dataViewCreateSchema = dataViewSchema.omit({ id: true });

export type DataView = z.infer<typeof dataViewSchema>;
export type DataViewCreate = z.infer<typeof dataViewCreateSchema>;
/** End DataView Entity Schema */

/** ContainerAccess Entity Schema */
export { containerAccessSchema } from '../schemas/entities/container-access';

export const containerAccessCreateSchema = containerAccessSchema.omit({ id: true });

export type ContainerAccess = z.infer<typeof containerAccessSchema>;
export type ContainerAccessCreate = z.infer<typeof containerAccessCreateSchema>;
/** End ContainerAccess Entity Schema */

/** WorkspaceMember Entity Schema */
export { workspaceMemberSchema } from '../schemas/entities/workspace-member';

export const workspaceMemberCreateSchema = workspaceMemberSchema.omit({ id: true });

export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type WorkspaceMemberCreate = z.infer<typeof workspaceMemberCreateSchema>;
/** End WorkspaceMember Entity Schema */

/** WorkspaceSlugRedirect Entity Schema */
export { workspaceSlugRedirectSchema } from '../schemas/entities/workspace-slug-redirect';

export const workspaceSlugRedirectCreateSchema = workspaceSlugRedirectSchema.omit({ id: true });

export type WorkspaceSlugRedirect = z.infer<typeof workspaceSlugRedirectSchema>;
export type WorkspaceSlugRedirectCreate = z.infer<typeof workspaceSlugRedirectCreateSchema>;
/** End WorkspaceSlugRedirect Entity Schema */
