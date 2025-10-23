import type { z } from 'zod';
import { pageContainerSchema } from '../schemas/entities/container';
import { workspaceSchema as workspaceSchemaEntity } from '../schemas/entities/workspace';

/** Container Entity Schema */
export { pageContainerSchema } from '../schemas/entities/container';
export const pageContainerCreateSchema = pageContainerSchema.omit({ id: true });
export type PageContainer = z.infer<typeof pageContainerSchema>;
export type PageContainerCreate = z.infer<typeof pageContainerCreateSchema>;

export const containerCreateSchema = pageContainerSchema.omit({ id: true });

export const containerSchema = pageContainerSchema;

export type Container = z.infer<typeof containerSchema>;
export type ContainerCreate = z.infer<typeof containerCreateSchema>;
/** End Container Entity Schema */

/** Workspace Entity Schema */
export { workspaceSchema } from '../schemas/entities/workspace';

export const workspaceCreateSchema = workspaceSchemaEntity.omit({ id: true });

export type Workspace = z.infer<typeof workspaceSchemaEntity>;
export type WorkspaceCreate = z.infer<typeof workspaceCreateSchema>;
/** End Workspace Entity Schema */
