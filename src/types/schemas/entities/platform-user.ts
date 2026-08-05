import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema } from '../utilities';

// The platform-wide role. `platform_admin` grants operational configuration rights only (see
// THOTH-045) — it is deliberately NOT part of the workspace `AccessGrant` model and confers no
// implicit access to any workspace content.
export const platformUserRoleSchema = z.enum(['user', 'platform_admin']);
export type PlatformUserRole = z.infer<typeof platformUserRoleSchema>;

// A minimal projection of a Better Auth user, used for platform-role checks, user-level quota
// configuration, and the admin user list (avoids Better Auth's admin plugin). `userId` is the
// Better Auth user id and is logically 1:1 with a projection row. `registeredAt` is copied from
// Better Auth's `user.createdAt` and is the deterministic tiebreaker for "first user".
export const platformUserSchema = z
  .object({
    userId: z.string().min(1),
    name: z.string(),
    email: z.string(),
    role: platformUserRoleSchema,
    registeredAt: z.string(),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withIdSchema.shape);

export type PlatformUserSchema = z.infer<typeof platformUserSchema>;
