import { z } from 'zod';

export const DELETE_DATA_SOURCE_COLUMN_ENDPOINT = '/data-sources/:id/columns/:columnId';

export const deleteDataSourceColumnParametersSchema = z.object({
  id: z.string().min(1),
  columnId: z.string().min(1),
});
export type DeleteDataSourceColumnParameters = z.infer<typeof deleteDataSourceColumnParametersSchema>;
