import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema } from '../utilities.js';

// Scopes a `setting` row applies at. `platform` rows use a fixed sentinel `subjectId`
// (`PLATFORM_SETTING_SUBJECT_ID`); `user`/`workspace` rows use the Better Auth user id or the
// workspace id respectively. See `src/lib/settings/definitions.ts` for the key registry.
export const settingScopeSchema = z.enum(['platform', 'user', 'workspace']);
export type SettingScope = z.infer<typeof settingScopeSchema>;

// A generic key/value configuration row (THOTH-045). `(scope, subjectId, key)` is the logical
// identity — SuperSave has no unique-index support, so uniqueness is enforced in application
// code (an in-process lock + deterministic canonical-row selection), see
// `src/lib/settings/service.ts`. `value` is the JSON-serialised setting value; the registered
// key's Zod schema (see definitions) validates the parsed value on read/write.
export const settingSchema = z
  .object({
    scope: settingScopeSchema,
    subjectId: z.string().min(1),
    key: z.string().min(1),
    value: z.string(),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withIdSchema.shape);

export type SettingSchema = z.infer<typeof settingSchema>;
