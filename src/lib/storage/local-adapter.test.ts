import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { LocalStorageAdapter } from './local-adapter';

const root = await mkdtemp(nodePath.join(tmpdir(), 'thoth-storage-adapter-test-'));
const adapter = new LocalStorageAdapter(root);

assert.equal(adapter.type, 'local');

// save + read round-trip
const key = 'workspace-1/file-1';
const payload = Buffer.from('hello uploaded world');
await adapter.save(key, payload);

assert.equal(await adapter.exists(key), true);

const stream = await adapter.read(key);
const chunks: Uint8Array[] = [];
for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
  chunks.push(chunk);
}
assert.equal(Buffer.concat(chunks).toString('utf8'), payload.toString('utf8'));

// nested directories are created as needed
const onDisk = await readFile(nodePath.join(root, key));
assert.equal(onDisk.toString('utf8'), payload.toString('utf8'));

// delete
await adapter.delete(key);
assert.equal(await adapter.exists(key), false);

// deleting a non-existent key is a no-op, not an error
await adapter.delete(key);

// exists() is false for a key that was never written
assert.equal(await adapter.exists('never-written'), false);

// path traversal is rejected
await assert.rejects(() => adapter.save('../escape', payload), /Invalid storage key/);
await assert.rejects(() => adapter.read('../../etc/passwd'), /Invalid storage key/);

await rm(root, { recursive: true, force: true });

console.log('✅  LocalStorageAdapter tests passed');
