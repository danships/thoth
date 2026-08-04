import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadStateFile, saveStateFile, acquireLock, StateFileCorruptError } from './state-store';
import { createInitialStateFile } from './types';

const temporaryDirectories: string[] = [];

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'notion-import-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('loadStateFile', () => {
  it('returns null when the file does not exist', async () => {
    const directory = await makeTemporaryDirectory();
    expect(await loadStateFile(path.join(directory, 'missing.json'))).toBeNull();
  });

  it('loads a previously-saved state file', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = path.join(directory, 'state.json');
    const state = createInitialStateFile({ notionWorkspaceId: 'nw', thothWorkspaceId: 'tw', targetParentId: null });
    await saveStateFile(filePath, state);
    const loaded = await loadStateFile(filePath);
    expect(loaded).toEqual(state);
  });

  it('refuses to run when the file is not valid JSON', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = path.join(directory, 'corrupt.json');
    await writeFile(filePath, '{ this is not json', 'utf8');
    await expect(loadStateFile(filePath)).rejects.toThrow(StateFileCorruptError);
  });

  it("refuses to run when the file doesn't match the expected schema", async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = path.join(directory, 'wrong-shape.json');
    await writeFile(filePath, JSON.stringify({ foo: 'bar' }), 'utf8');
    await expect(loadStateFile(filePath)).rejects.toThrow(StateFileCorruptError);
  });

  it('refuses to run when the version is unsupported', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = path.join(directory, 'bad-version.json');
    const state = createInitialStateFile({ notionWorkspaceId: null, thothWorkspaceId: 'tw', targetParentId: null });
    await writeFile(filePath, JSON.stringify({ ...state, version: 2 }), 'utf8');
    await expect(loadStateFile(filePath)).rejects.toThrow(StateFileCorruptError);
  });

  it('refuses to run when a mapping entry is malformed', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = path.join(directory, 'bad-mapping.json');
    const state = createInitialStateFile({ notionWorkspaceId: null, thothWorkspaceId: 'tw', targetParentId: null });
    await writeFile(
      filePath,
      JSON.stringify({ ...state, mappings: { 'notion-1': { notionType: 'not-a-real-type' } } }),
      'utf8'
    );
    await expect(loadStateFile(filePath)).rejects.toThrow(StateFileCorruptError);
  });

  it('refuses to run when lastRun is malformed', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = path.join(directory, 'bad-last-run.json');
    const state = createInitialStateFile({ notionWorkspaceId: null, thothWorkspaceId: 'tw', targetParentId: null });
    await writeFile(filePath, JSON.stringify({ ...state, lastRun: null }), 'utf8');
    await expect(loadStateFile(filePath)).rejects.toThrow(StateFileCorruptError);
  });
});

describe('saveStateFile', () => {
  it('writes atomically, leaving no leftover temp file', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = path.join(directory, 'state.json');
    const state = createInitialStateFile({ notionWorkspaceId: null, thothWorkspaceId: 'tw', targetParentId: null });
    await saveStateFile(filePath, state);

    const raw = await readFile(filePath, 'utf8');
    expect(JSON.parse(raw)).toEqual(state);
  });

  it('creates parent directories as needed', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = path.join(directory, 'nested', 'directory', 'state.json');
    const state = createInitialStateFile({ notionWorkspaceId: null, thothWorkspaceId: 'tw', targetParentId: null });
    await saveStateFile(filePath, state);
    expect(await loadStateFile(filePath)).toEqual(state);
  });
});

describe('acquireLock', () => {
  it('acquires and releases a lock file', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = path.join(directory, 'state.json');
    const release = await acquireLock(filePath);
    await release();
    // Should be able to acquire again after release.
    const release2 = await acquireLock(filePath);
    await release2();
  });

  it('rejects a second concurrent lock attempt', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = path.join(directory, 'state.json');
    const release = await acquireLock(filePath);
    await expect(acquireLock(filePath)).rejects.toThrow(/already exists/);
    await release();
  });
});
