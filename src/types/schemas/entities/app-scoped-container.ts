import { z } from 'zod';
import { withIdSchema } from '../utilities';

// Join row linking an `App` to a `Container` (page or data source) it is explicitly scoped to.
// See `src/lib/database/entities/app-scoped-container.ts` for the table's purpose.
export const appScopedContainerSchema = z
  .object({
    appId: z.string().min(1),
    containerId: z.string().min(1),
    createdAt: z.string(),
  })
  .extend(withIdSchema.shape);

export type AppScopedContainerSchema = z.infer<typeof appScopedContainerSchema>;
