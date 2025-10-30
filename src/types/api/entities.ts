import { dataViewSchema as dataViewSchemaEntity } from '../schemas/entities/data-view';
import { pageContainerSchema, dataSourceContainerSchema } from '../schemas/entities/container';
import { z } from 'zod';

export const pageSchema = pageContainerSchema.pick({
  id: true,
  name: true,
  createdAt: true,
  lastUpdated: true,
  emoji: true,
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
});
export type DataSource = z.infer<typeof dataSourceSchema>;
