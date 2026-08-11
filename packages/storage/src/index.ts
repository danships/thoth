import { LocalStorageAdapter } from './local-adapter';
import type { StorageAdapter } from './types';

export type { StorageAdapter } from './types';
export { StorageError } from './errors';
export { LocalStorageAdapter } from './local-adapter';

export type CreateStorageAdapterOptions = {
  type: string;
  localFolder: string;
};

/**
 * Factory switching on an explicit `{ type, localFolder }` options object — this package never
 * reads environment variables or the web environment validator itself (THOTH-058), so it stays
 * usable from any process (web, a future job service, CLIs) without a Next.js/web dependency.
 * Only `'local'` is implemented today; adding e.g. an S3-backed adapter later is a matter of
 * adding a `case` here and implementing `StorageAdapter`.
 */
export function createStorageAdapter(options: CreateStorageAdapterOptions): StorageAdapter {
  switch (options.type) {
    case 'local': {
      return new LocalStorageAdapter(options.localFolder);
    }
    default: {
      throw new Error(`Unsupported storage type: ${options.type}`);
    }
  }
}
