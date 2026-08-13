import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities.js';

// Canonical record of an uploaded blob. `storageKey`/`storageType` are opaque details of
// wherever `getStorageAdapter()` actually persisted the bytes (see `src/lib/storage`) — never
// exposed directly to the client, which only ever sees `/api/v1/files/<id>/content`.
export const uploadedFileSchema = z
  .object({
    filename: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(255),
    size: z.number().int().nonnegative(),
    extension: z.string().max(32).nullable(),
    storageKey: z.string().min(1),
    storageType: z.string().min(1),
    // The user whose storage quota this upload counts against (THOTH-045). Optional/nullable for
    // backward-compatibility with rows created before this field existed (a migration backfills
    // them); always populated on new uploads. For `app--<id>`-attributed uploads this is the
    // owning App's `createdByUserId`, so per-user quota is charged to a real user.
    billingUserId: z.string().min(1).nullable().optional(),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);

export type UploadedFileSchema = z.infer<typeof uploadedFileSchema>;
