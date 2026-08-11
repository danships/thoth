// Storage-package-local error, independent of any web/Next.js/HTTP error hierarchy (this
// package must never import from `@thoth/database` or `apps/web`). Thrown only for the
// path-traversal defense-in-depth check in `local-adapter.ts` — in practice unreachable, since
// every caller passes an opaque, server-generated key (never a client-controlled filename).
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}
