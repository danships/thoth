import { z } from 'zod';
import { withIdSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities';

// Many-to-many join between an `uploaded-file` and the pages (`container`) it is used on. Also
// the visibility boundary for the file (see `src/lib/files/access.ts`): a file is retrievable
// only through a page the caller can access. Uniqueness of `(fileId, containerId)` is enforced
// at the application layer by `syncFileUsageForPage` (query-then-create, serialized per
// `containerId` via an in-process lock — see that module), not by a DB constraint — SuperSave
// has no composite-unique-constraint support via `filterSortFields`.
export const fileUsageSchema = z
  .object({
    fileId: z.string().min(1),
    containerId: z.string().min(1),
    createdAt: z.string(),
  })
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);

export type FileUsageSchema = z.infer<typeof fileUsageSchema>;
