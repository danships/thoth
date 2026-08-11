// Re-exported from `@thoth/database` (THOTH-058): the HttpError hierarchy has zero web/Next.js
// dependencies, so it lives in the shared package. Kept as a thin shim here so the ~55 existing
// `@/lib/errors/*` import sites across the web app don't need to change.
export { HttpError } from '@thoth/database/errors';
