import { createStorageAdapter } from '@thoth/storage';
import type { StorageAdapter } from '@thoth/storage';
import { getEnvironment } from '@/lib/environment';

export type { StorageAdapter } from '@thoth/storage';

let cachedAdapter: StorageAdapter | undefined;

/**
 * Web-owned adapter around `@thoth/storage`'s `createStorageAdapter` factory (THOTH-058): reads
 * the validated web environment once and caches the resulting adapter, mirroring
 * `getDatabase()`'s caching pattern. The package itself never reads environment variables or
 * decides file access — this is the only place `STORAGE_TYPE`/`STORAGE_LOCAL_FOLDER` are read.
 */
export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (cachedAdapter) {
    return cachedAdapter;
  }

  const environment = await getEnvironment();

  cachedAdapter = createStorageAdapter({
    type: environment.STORAGE_TYPE,
    localFolder: environment.STORAGE_LOCAL_FOLDER,
  });

  return cachedAdapter;
}
