import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { LocalStorageAdapter } from './local-adapter';

describe('LocalStorageAdapter', () => {
  let root: string;
  let adapter: LocalStorageAdapter;

  beforeAll(async () => {
    root = await mkdtemp(nodePath.join(tmpdir(), 'thoth-storage-adapter-test-'));
    adapter = new LocalStorageAdapter(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('reports type as local', () => {
    expect(adapter.type).toBe('local');
  });

  test('save + read round-trip', async () => {
    const key = 'workspace-1/file-1';
    const payload = Buffer.from('hello uploaded world');
    await adapter.save(key, payload);

    expect(await adapter.exists(key)).toBe(true);

    const stream = await adapter.read(key);
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    expect(Buffer.concat(chunks).toString('utf8')).toBe(payload.toString('utf8'));

    // nested directories are created as needed
    const onDisk = await readFile(nodePath.join(root, key));
    expect(onDisk.toString('utf8')).toBe(payload.toString('utf8'));
  });

  test('delete removes the key', async () => {
    const key = 'workspace-1/file-1';
    const payload = Buffer.from('hello uploaded world');
    await adapter.save(key, payload);
    await adapter.delete(key);
    expect(await adapter.exists(key)).toBe(false);
  });

  test('deleting a non-existent key is a no-op', async () => {
    await adapter.delete('workspace-1/file-1');
  });

  test('exists() is false for a key that was never written', async () => {
    expect(await adapter.exists('never-written')).toBe(false);
  });

  test('path traversal is rejected', async () => {
    const payload = Buffer.from('test');
    await expect(() => adapter.save('../escape', payload)).rejects.toThrow(/Invalid storage key/);
    await expect(() => adapter.read('../../etc/passwd')).rejects.toThrow(/Invalid storage key/);
  });
});
