/**
 * Next.js instrumentation hook — runs once, before the server starts serving any request
 * (both `next dev` and `next start`/standalone).
 *
 * `@thoth/database`-backed service shims under `apps/web/src/lib/database/*` (e.g.
 * `app-service`, `seed-workspace`, `webhook-service`) call the package's repository accessors
 * directly rather than through `@/lib/database`'s `ensureDatabaseContext()` wrapper, so the
 * database context must already be registered before any of them are used. Eagerly
 * initializing it here — rather than relying on the first wrapped `@/lib/database` call in a
 * request — closes that gap deterministically.
 */
export async function register(): Promise<void> {
  // Only the Node.js runtime touches the database (the Edge runtime never does).
  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    const { initializeDatabase } = await import('@/lib/database');
    await initializeDatabase();
  }
}
