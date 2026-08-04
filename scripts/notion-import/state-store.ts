// Loads/saves the local `.json` state file that holds the Notion↔Thoth id mapping, content
// fingerprints, and the last run's report/status. Writes are atomic (temp file + `rename`) so a
// crash mid-write never corrupts the previous, valid state.

import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { StateFile } from './types';

export class StateFileCorruptError extends Error {}

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

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !('mappings' in parsed) ||
    !('connection' in parsed)
  ) {
    throw new StateFileCorruptError(`State file at ${filePath} does not match the expected schema. Refusing to run.`);
  }

  return parsed as StateFile;
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
