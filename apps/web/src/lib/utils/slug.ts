// Pure — moved to `@thoth/database` (THOTH-058). Re-exported here since `apps/web/src/lib/auth/config.ts`
// and `apps/web/src/scripts/seed.ts` still import from this path. Imported from the dedicated
// `@thoth/database/utils/slug` subpath (not the main package entry point) so this stays reachable
// from client components without pulling in server-only DB/context code (supersave, better-sqlite3).
export { RESERVED_WORKSPACE_SLUGS, slugify, isReservedWorkspaceSlug } from '@thoth/database/utils/slug';
