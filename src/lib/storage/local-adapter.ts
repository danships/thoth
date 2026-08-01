import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { BadRequestError } from '@/lib/errors/bad-request-error';
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
    if (resolved !== this.rootFolder && !resolved.startsWith(`${this.rootFolder}/`)) {
      throw new BadRequestError('Invalid storage key');
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
    const buffer = await readFile(filePath);
    return Readable.toWeb(Readable.from(buffer)) as ReadableStream;
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

export function buildStorageKey(...segments: string[]): string {
  return path.join(...segments);
}
