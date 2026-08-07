import { getEnvironment } from '@/lib/environment';
import { LocalStorageAdapter } from './local-adapter';
import type { StorageAdapter } from './types';

export type { StorageAdapter } from './types';

let cachedAdapter: StorageAdapter | undefined;

/**
 * Factory switching on `STORAGE_TYPE`. Cached after first resolution — every call site shares
 * the same adapter instance, mirroring `getDatabase()`'s caching pattern. Only `'local'` is
 * implemented today; adding e.g. an S3-backed adapter later is a matter of adding a `case` here
 * and implementing `StorageAdapter`, with no changes needed at any call site.
 */
export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (cachedAdapter) {
    return cachedAdapter;
  }

  const environment = await getEnvironment();

  switch (environment.STORAGE_TYPE) {
    case 'local': {
      cachedAdapter = new LocalStorageAdapter(environment.STORAGE_LOCAL_FOLDER);
      return cachedAdapter;
    }
    default: {
      throw new Error(`Unsupported STORAGE_TYPE: ${String(environment.STORAGE_TYPE)}`);
    }
  }
}
