// Loads/saves the local `.json` state file that holds the Notion↔Thoth id mapping, content
// fingerprints, and the last run's report/status. Writes are atomic (temp file + `rename`) so a
// crash mid-write never corrupts the previous, valid state.

import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { StateFile } from './types';

export class StateFileCorruptError extends Error {}

const SUPPORTED_VERSIONS = new Set([1]);
const SYNC_MODES = new Set(['initial', 'sync']);
const RUN_STATES = new Set(['completed', 'partially_completed', 'failed']);
const NOTION_OBJECT_TYPES = new Set(['page', 'database', 'database_row']);
const RUN_STAT_KEYS = ['created', 'updated', 'skippedUnchanged', 'skippedConflict', 'unsupported', 'failed'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isValidConnection(value: unknown): boolean {
  return (
    isRecord(value) &&
    isStringOrNull(value['notionWorkspaceId']) &&
    typeof value['thothWorkspaceId'] === 'string' &&
    isStringOrNull(value['targetParentId'])
  );
}

function isValidLastRun(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value['startedAt'] !== 'string' || !isStringOrNull(value['finishedAt'])) {
    return false;
  }
  if (typeof value['mode'] !== 'string' || !SYNC_MODES.has(value['mode'])) {
    return false;
  }
  if (typeof value['dryRun'] !== 'boolean') {
    return false;
  }
  if (typeof value['state'] !== 'string' || !RUN_STATES.has(value['state'])) {
    return false;
  }
  if (!isRecord(value['stats']) || RUN_STAT_KEYS.some((key) => typeof value['stats']![key as never] !== 'number')) {
    return false;
  }
  if (!isStringOrNull(value['error']) || !Array.isArray(value['report'])) {
    return false;
  }
  return true;
}

function isValidColumnMapping(value: unknown): boolean {
  if (!isRecord(value) || typeof value['thothColumnId'] !== 'string' || typeof value['type'] !== 'string') {
    return false;
  }
  if (value['optionIdsByLabel'] !== undefined && !isRecord(value['optionIdsByLabel'])) {
    return false;
  }
  return true;
}

function isValidMapping(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value['notionType'] !== 'string' || !NOTION_OBJECT_TYPES.has(value['notionType'])) {
    return false;
  }
  if (!isStringOrNull(value['thothContainerId']) || !isStringOrNull(value['thothColumnId'])) {
    return false;
  }
  if (typeof value['notionLastEditedTime'] !== 'string' || typeof value['importedContentHash'] !== 'string') {
    return false;
  }
  if (typeof value['deletedInNotion'] !== 'boolean') {
    return false;
  }
  if (
    value['columnMappings'] !== undefined &&
    (!isRecord(value['columnMappings']) ||
      !Object.values(value['columnMappings']).every((entry) => isValidColumnMapping(entry)))
  ) {
    return false;
  }
  return true;
}

// Validates the full persisted-state shape (not just the presence of top-level keys) before
// trusting it: an unsupported `version`, a malformed `lastRun`/`connection`, or a single
// corrupted mapping entry must all be treated as a corrupt state file rather than silently
// cast and used, which could otherwise crash later or silently misbehave mid-run.
function isValidStateFile(value: unknown): value is StateFile {
  if (!isRecord(value)) {
    return false;
  }
  if (!SUPPORTED_VERSIONS.has(value['version'] as number)) {
    return false;
  }
  if (!isValidConnection(value['connection'])) {
    return false;
  }
  if (!isRecord(value['mappings']) || !Object.values(value['mappings']).every((entry) => isValidMapping(entry))) {
    return false;
  }
  if (!isValidLastRun(value['lastRun'])) {
    return false;
  }
  return true;
}

export async function loadStateFile(filePath: string): Promise<StateFile | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StateFileCorruptError(
      `State file at ${filePath} is not valid JSON. Refusing to run — restore a backup or start fresh with a new STATE_FILE path.`
    );
  }

  if (!isValidStateFile(parsed)) {
    throw new StateFileCorruptError(`State file at ${filePath} does not match the expected schema. Refusing to run.`);
  }

  return parsed;
}

// Writes the state file atomically: write to a sibling temp file, then `rename` over the real
// path (rename is atomic on POSIX filesystems within the same directory).
export async function saveStateFile(filePath: string, state: StateFile): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
  await rename(temporaryPath, filePath);
}

// Simple advisory lock file (`<path>.lock`) to prevent two concurrent runs against the same
// state file. Uses `wx` (exclusive create) so a stale lock left by a hard-killed process must be
// removed manually — the alternative (auto-expiring locks) risks two runs writing concurrently.
export async function acquireLock(stateFilePath: string): Promise<() => Promise<void>> {
  const lockPath = `${stateFilePath}.lock`;
  await mkdir(path.dirname(lockPath), { recursive: true });
  try {
    await writeFile(lockPath, String(process.pid), { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `Lock file ${lockPath} already exists — another run may be in progress. If you're certain it's stale, delete it and retry.`
      );
    }
    throw error;
  }

  return async () => {
    await unlink(lockPath).catch(() => undefined);
  };
}
