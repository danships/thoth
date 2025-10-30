import { z } from 'zod';
import { pageContainerSchema, dataSourceContainerSchema } from '../schemas/entities/container';
import { workspaceSchema as workspaceSchemaEntity } from '../schemas/entities/workspace';
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
