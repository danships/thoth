import { createStorageAdapter, type StorageAdapter } from '@thoth/storage';
import { getEnvironment } from './environment.js';

/**
 * Lazily-constructed, cached `@thoth/storage` adapter for `@thoth/jobs` (THOTH-063), mirroring
 * `apps/web/src/lib/storage/index.ts`'s caching pattern but fully independent of the web
 * package/environment validator. Reads `STORAGE_TYPE`/`STORAGE_LOCAL_FOLDER` from this
 * process's own validated environment (see `../environment.ts`) — the only place those
 * variables are read inside `@thoth/jobs`. Used exclusively by the `maintenance.purge-files`
 * handler.
 */
let cachedAdapter: StorageAdapter | undefined;

export function getStorageAdapter(): StorageAdapter {
  if (!cachedAdapter) {
    const environment = getEnvironment();
    cachedAdapter = createStorageAdapter({
      type: environment.STORAGE_TYPE,
      localFolder: environment.STORAGE_LOCAL_FOLDER,
    });
  }
  return cachedAdapter;
}

/** Test-only helper to reset the cached adapter between test files. */
export function resetStorageAdapterForTests(): void {
  cachedAdapter = undefined;
}
