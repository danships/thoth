import { z } from 'zod';
import { withIdSchema } from '../utilities';

// Join row linking a `WorkspaceMember` to a `Container` (page or data source) it is explicitly
// scoped to. Mirrors `appScopedContainerSchema` — see
// `src/lib/database/entities/member-scoped-container.ts` for the table's purpose.
export const memberScopedContainerSchema = z
  .object({
    workspaceMemberId: z.string().min(1),
    containerId: z.string().min(1),
    createdAt: z.string(),
  })
  .extend(withIdSchema.shape);

export type MemberScopedContainerSchema = z.infer<typeof memberScopedContainerSchema>;
