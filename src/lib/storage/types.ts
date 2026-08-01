// Pluggable file-storage abstraction (THOTH-040). Today only a `LocalStorageAdapter` (writing
// to a configurable folder on the local filesystem) exists, but call sites depend only on this
// type, so a future S3-backed (or similar) adapter can be swapped in via `getStorageAdapter()`
// without touching upload/serve routes.
export type StorageAdapter = {
  // A short discriminator persisted alongside the file (`uploaded-file.storageType`) so a
  // future migration/mixed-backend scenario can tell which adapter wrote a given key.
  type: string;

  // Persists `data` under `key`, creating any intermediate folders as needed. `key` is an
  // opaque identifier chosen by the caller (never derived from user-controlled filenames).
  save: (key: string, data: Buffer) => Promise<void>;

  // Returns a readable stream of the bytes stored under `key`. Throws if the key doesn't exist
  // (callers should check `exists` first if a non-throwing check is needed).
  read: (key: string) => Promise<ReadableStream>;

  // Removes the bytes stored under `key`. A no-op (does not throw) if the key doesn't exist.
  delete: (key: string) => Promise<void>;

  // Non-throwing existence check, used by the serve endpoint to return a clean 404 instead of
  // letting a missing-file error surface as a 500.
  exists: (key: string) => Promise<boolean>;
};
