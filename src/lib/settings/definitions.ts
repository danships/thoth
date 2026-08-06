import { z } from 'zod';
import type { SettingScope } from '@/types/schemas/entities/setting';
import { DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES } from '@/types/schemas/entities/workspace';

/**
 * The single registry of setting keys (THOTH-045). Each definition declares which scopes the
 * key is valid at, a Zod schema validating the (parsed) value, and a per-scope default resolved
 * when no row exists. This is the ONLY place setting keys are defined — the service
 * (`src/lib/settings/service.ts`) infers value types from these entries, and public APIs stay
 * purpose-specific (there is deliberately no generic key/value HTTP endpoint).
 */

// Non-negative safe integer byte count, or `null` for "no limit at this scope". `0` disables
// uploads entirely at that scope.
const quotaBytesSchema = z.number().int().nonnegative().nullable();

type SettingDefinition = {
  scopes: readonly SettingScope[];
  schema: z.ZodType;
  defaults: Partial<Record<SettingScope, unknown>>;
};

export const SETTING_DEFINITIONS = {
  // Controls self-service creation of *additional* workspaces via `POST /api/v1/workspaces`. The
  // one-time workspace provisioned by the signup hook is exempt (documented onboarding
  // exception). Platform admins bypass this regardless.
  'workspace.creation.self_service_enabled': {
    scopes: ['platform'],
    schema: z.boolean(),
    defaults: { platform: true },
  },
  // Uploaded-file storage quota in bytes, configurable at platform / user / workspace scope.
  // An upload must satisfy every applicable non-null quota (see `assertWithinStorageQuotas`).
  'storage.quota_bytes': {
    scopes: ['platform', 'user', 'workspace'],
    schema: quotaBytesSchema,
    defaults: {
      platform: null,
      user: null,
      workspace: DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES,
    },
  },
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;

export type SettingValue<Key extends SettingKey> = z.infer<(typeof SETTING_DEFINITIONS)[Key]['schema']>;

// Fixed sentinel `subjectId` for platform-scoped rows (there is only ever one platform).
export const PLATFORM_SETTING_SUBJECT_ID = 'platform';

export const WORKSPACE_CREATION_SELF_SERVICE_KEY = 'workspace.creation.self_service_enabled' satisfies SettingKey;
export const STORAGE_QUOTA_BYTES_KEY = 'storage.quota_bytes' satisfies SettingKey;

export function getSettingDefinition<Key extends SettingKey>(key: Key): (typeof SETTING_DEFINITIONS)[Key] {
  return SETTING_DEFINITIONS[key];
}

export function settingSupportsScope(key: SettingKey, scope: SettingScope): boolean {
  return (SETTING_DEFINITIONS[key].scopes as readonly SettingScope[]).includes(scope);
}

export function getSettingDefault<Key extends SettingKey>(key: Key, scope: SettingScope): SettingValue<Key> {
  const definition = SETTING_DEFINITIONS[key];
  const defaults = definition.defaults as Partial<Record<SettingScope, unknown>>;
  if (!(scope in defaults)) {
    // Every supported scope must declare a default; this guards against a misconfigured registry.
    throw new Error(`Setting "${key}" has no default for scope "${scope}"`);
  }
  return defaults[scope] as SettingValue<Key>;
}
