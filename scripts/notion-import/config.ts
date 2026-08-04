// Environment-variable configuration for the Notion import script. Everything the script needs
// is read from `process.env` — no config files, no CLI flags (besides what env vars provide) —
// per the THOTH-049 "single self-contained external script" spec.

export type Config = {
  notionToken: string;
  thothApiUrl: string;
  thothApiKey: string;
  thothWorkspaceId: string;
  thothTargetParentId: string | null;
  stateFilePath: string;
  dryRun: boolean;
  notionRootIds: string[] | null;
  importMode: 'auto' | 'initial' | 'sync';
};

export type EnvironmentLike = Record<string, string | undefined>;

export class ConfigError extends Error {}

// Reads and validates configuration from `process.env`. Throws `ConfigError` (never exits the
// process directly) so callers/tests can decide how to react.
export function loadConfig(environment: EnvironmentLike = process.env): Config {
  const notionToken = requireFromEnvironment(environment, 'NOTION_TOKEN');
  const thothApiUrl = requireFromEnvironment(environment, 'THOTH_API_URL');
  const thothApiKey = requireFromEnvironment(environment, 'THOTH_API_KEY');
  const thothWorkspaceId = requireFromEnvironment(environment, 'THOTH_WORKSPACE_ID');
  const stateFilePath = requireFromEnvironment(environment, 'STATE_FILE');

  if (!thothApiUrl.startsWith('https://') && !thothApiUrl.startsWith('http://')) {
    throw new ConfigError('THOTH_API_URL must be an absolute http(s) URL');
  }
  if (thothApiUrl.startsWith('http://')) {
    console.warn('[notion-import] WARNING: THOTH_API_URL is not using https — credentials will be sent in clear text.');
  }

  const importMode = (environment['IMPORT_MODE']?.trim() || 'auto') as Config['importMode'];
  if (!['auto', 'initial', 'sync'].includes(importMode)) {
    throw new ConfigError(`Invalid IMPORT_MODE: ${environment['IMPORT_MODE']}. Expected one of auto, initial, sync.`);
  }

  return {
    notionToken,
    thothApiUrl: thothApiUrl.replace(/\/+$/, ''),
    thothApiKey,
    thothWorkspaceId,
    thothTargetParentId: environment['THOTH_TARGET_PARENT_ID']?.trim() || null,
    stateFilePath,
    dryRun: readBooleanFromEnvironment(environment, 'DRY_RUN', false),
    notionRootIds: readListFromEnvironment(environment, 'NOTION_ROOT_IDS'),
    importMode,
  };
}

function requireFromEnvironment(environment: EnvironmentLike, name: string): string {
  const value = environment[name];
  if (!value || value.trim().length === 0) {
    throw new ConfigError(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function readBooleanFromEnvironment(environment: EnvironmentLike, name: string, defaultValue: boolean): boolean {
  const value = environment[name];
  if (value === undefined || value.trim().length === 0) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  throw new ConfigError(`Invalid ${name}: ${value}. Expected one of ${[...TRUE_VALUES, ...FALSE_VALUES].join(', ')}.`);
}

function readListFromEnvironment(environment: EnvironmentLike, name: string): string[] | null {
  const value = environment[name];
  if (!value || value.trim().length === 0) {
    return null;
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
