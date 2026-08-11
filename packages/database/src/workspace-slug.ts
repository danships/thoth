import { getWorkspaceRepository } from './repositories';
import { isReservedWorkspaceSlug, slugify } from './utils/slug';
import { ConflictError } from './errors/conflict-error';

// SuperSave has no unique-constraint support, so the check-then-write below cannot be made
// race-safe at the database level. This in-process lock, keyed by the slug string itself (not
// by user — two *different* users racing for the same slug must also be serialized), mitigates
// the common case. It does not protect against races across multiple server instances.
const slugReservationLocks = new Map<string, Promise<unknown>>();

async function withSlugLock<T>(slug: string, task: () => Promise<T>): Promise<T> {
  const previous = slugReservationLocks.get(slug) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tracked = run.catch(() => undefined);
  slugReservationLocks.set(slug, tracked);
  try {
    return await run;
  } finally {
    if (slugReservationLocks.get(slug) === tracked) {
      slugReservationLocks.delete(slug);
    }
  }
}

/**
 * Validates and reserves a globally unique workspace slug, then invokes `onReserved` (e.g. to
 * create/update the `Workspace` row) while still holding the lock, so the check-then-write is
 * effectively atomic per slug. Throws `ConflictError` (409) if the slug is a reserved word or
 * already taken by another (non-excluded) workspace — `onReserved` is never called in that case.
 */
export async function reserveWorkspaceSlug<T>(
  slug: string,
  onReserved: () => Promise<T>,
  excludeWorkspaceId?: string
): Promise<T> {
  return withSlugLock(slug, async () => {
    if (isReservedWorkspaceSlug(slug)) {
      throw new ConflictError(`Slug "${slug}" is reserved and cannot be used`);
    }

    const workspaceRepository = await getWorkspaceRepository();
    const existing = await workspaceRepository.getByQuery(workspaceRepository.createQuery().eq('slug', slug));

    // Soft-deleted workspaces don't hold their slug hostage for the full grace period — a new
    // workspace (or a restore, which handles its own conflict-renaming) may reuse it
    // immediately. SuperSave can't reliably filter `.eq('deletedAt', null)` at the query level
    // (same documented limitation as `parentId`), so the check is done in application code.
    const collides = existing.some((workspace) => workspace.id !== excludeWorkspaceId && !workspace.deletedAt);
    if (collides) {
      throw new ConflictError(`Slug "${slug}" is already taken`);
    }

    return onReserved();
  });
}

/**
 * Non-reserving availability check, used by the slug-availability endpoint and client-side
 * live-validation. Does not take the lock — this is a best-effort read, not a reservation.
 */
export async function isWorkspaceSlugAvailable(slug: string, excludeWorkspaceId?: string): Promise<boolean> {
  if (isReservedWorkspaceSlug(slug)) {
    return false;
  }

  const workspaceRepository = await getWorkspaceRepository();
  const existing = await workspaceRepository.getByQuery(workspaceRepository.createQuery().eq('slug', slug));

  return !existing.some((workspace) => workspace.id !== excludeWorkspaceId && !workspace.deletedAt);
}

/**
 * Generates a globally-unique slug from a base string, appending `-2`, `-3`, ... on collision.
 * Unlike `reserveWorkspaceSlug`, this does not throw — it always returns an available slug.
 * Candidate selection runs inside the same per-slug lock as `reserveWorkspaceSlug` so two
 * concurrent generation calls can never both settle on (and separately believe they "won") the
 * same candidate.
 */
export async function generateUniqueWorkspaceSlug(base: string, excludeWorkspaceId?: string): Promise<string> {
  const workspaceRepository = await getWorkspaceRepository();
  const baseSlug = slugify(base);

  let candidate = baseSlug;
  let suffix = 2;
  // Loop is bounded by workspace count in practice; reserved words and collisions are the only
  // reasons to retry.
  while (true) {
    const nextCandidate: string = candidate;
    const isAvailable = await withSlugLock(nextCandidate, async () => {
      if (isReservedWorkspaceSlug(nextCandidate)) {
        return false;
      }
      const existing = await workspaceRepository.getByQuery(
        workspaceRepository.createQuery().eq('slug', nextCandidate)
      );
      // As in reserveWorkspaceSlug, soft-deleted workspaces never block slug reuse.
      return !existing.some((workspace) => workspace.id !== excludeWorkspaceId && !workspace.deletedAt);
    });

    if (isAvailable) {
      return nextCandidate;
    }

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}
