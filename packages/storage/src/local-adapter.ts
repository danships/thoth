import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { StorageError } from './errors';
import type { StorageAdapter } from './types';

/**
 * Filesystem-backed `StorageAdapter`. Writes/reads/deletes files under a configurable root
 * folder (`STORAGE_LOCAL_FOLDER`, defaulting to `<cwd>/data/uploads`). Keys are always opaque,
 * server-generated identifiers (derived from the `uploaded-file` entity's own `id`) — client
 * filenames are never used to build the on-disk path, and `resolveKeyPath` additionally asserts
 * the resolved path stays within the storage root as defense-in-depth against a malformed key
 * ever reaching this adapter.
 */
export class LocalStorageAdapter implements StorageAdapter {
  public readonly type = 'local';

  private readonly rootFolder: string;

  constructor(rootFolder: string) {
    this.rootFolder = path.isAbsolute(rootFolder) ? rootFolder : path.resolve(process.cwd(), rootFolder);
  }

  private resolveKeyPath(key: string): string {
    const resolved = path.resolve(this.rootFolder, key);
    // `path.relative` is used (rather than a hardcoded `${rootFolder}/` prefix check) so
    // traversal is detected correctly across platform-specific separators, and the root itself
    // (relative === '') is still accepted.
    const relative = path.relative(this.rootFolder, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new StorageError('Invalid storage key');
    }
    return resolved;
  }

  public async save(key: string, data: Buffer): Promise<void> {
    const filePath = this.resolveKeyPath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  public async read(key: string): Promise<ReadableStream> {
    const filePath = this.resolveKeyPath(key);
    // Streams directly from disk instead of buffering the whole file in memory first — the
    // content route's own `exists()` check already handles the missing-file case.
    return Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  }

  public async delete(key: string): Promise<void> {
    const filePath = this.resolveKeyPath(key);
    await rm(filePath, { force: true });
  }

  public async exists(key: string): Promise<boolean> {
    const filePath = this.resolveKeyPath(key);
    try {
      const info = await stat(filePath);
      return info.isFile();
    } catch {
      return false;
    }
  }
}
