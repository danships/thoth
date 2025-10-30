import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities';

export const dataViewSchema = z
  .object({
    name: z.string().min(1),
    dataSourceId: z.string().min(1),
    columns: z.array(z.string().min(1)),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);
