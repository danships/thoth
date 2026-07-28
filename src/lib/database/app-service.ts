import crypto from 'node:crypto';
import { getApiKeyRepository, getAppRepository, getContainerRepository, getWorkspaceMemberRepository } from './index';
import type { ApiKey, App } from '@/types/database';

// The single place the `"app--"` owner-id prefix convention is constructed/parsed, so it's
// never hand-typed/duplicated at call sites. See Architecture Decision 1 in the THOTH-026 spec:
// content written through an App with `attributionMode === 'app'` is stamped with
// `userId = toAppOwnerId(app.id)` instead of a real `better-auth` user id, making the id
// self-describing via a cheap string-prefix check (`isAppOwnerId`) anywhere in the codebase.
const APP_OWNER_ID_PREFIX = 'app--';

export function toAppOwnerId(appId: string): string {
  return `${APP_OWNER_ID_PREFIX}${appId}`;
}

export function isAppOwnerId(userId: string): boolean {
  return userId.startsWith(APP_OWNER_ID_PREFIX);
}

export function parseAppOwnerId(userId: string): string | null {
  return isAppOwnerId(userId) ? userId.slice(APP_OWNER_ID_PREFIX.length) : null;
}

/**
 * Mints a new raw API key. `raw` is returned to the caller exactly once (never persisted);
 * only `hash` (SHA-256 hex digest) is stored, alongside `prefix` (first 12 chars of `raw`) for
 * display purposes. A 256-bit random token doesn't need password-grade hashing (bcrypt/argon2)
 * — SHA-256 is sufficient and avoids adding a dependency.
 */
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `thk_${crypto.randomBytes(32).toString('base64url')}`;
  const prefix = raw.slice(0, 12);
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  return { raw, prefix, hash };
}

/**
 * Looks up an `ApiKey` by its raw value (hashed for lookup), returning `null` unless the key
 * is found, not revoked, not expired, and its parent `App` is not archived. `expiresAt <= now`
 * (inclusive) is treated as expired, avoiding a race at the exact comparison instant.
 */
export async function verifyApiKey(rawKey: string): Promise<{ apiKey: ApiKey; app: App } | null> {
  if (!rawKey) {
    return null;
  }

  const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const apiKeyRepository = await getApiKeyRepository();
  const apiKey = await apiKeyRepository.getOneByQuery(apiKeyRepository.createQuery().eq('keyHash', hash));

  if (!apiKey || apiKey.revokedAt) {
    return null;
  }

  if (apiKey.expiresAt && apiKey.expiresAt <= new Date().toISOString()) {
    return null;
  }

  const appRepository = await getAppRepository();
  const app = await appRepository.getOneByQuery(appRepository.createQuery().eq('id', apiKey.appId));

  if (!app || app.archivedAt) {
    return null;
  }

  return { apiKey, app };
}

/**
 * Iteratively expands `containerIds` to include every descendant (recursively, via
 * `Container.parentId`), scoped to `workspaceId`. Used by `access-grant.ts` for
 * `scopeType === 'containers_with_children'`, resolved dynamically at check time (never
 * denormalized) so reparenting containers is automatically reflected without touching any
 * grant data.
 */
export async function resolveContainerDescendants(containerIds: string[], workspaceId: string): Promise<Set<string>> {
  const containerRepository = await getContainerRepository();
  const descendants = new Set<string>();
  let frontier = [...containerIds];

  while (frontier.length > 0) {
    const children = await containerRepository.getByQuery(
      containerRepository.createQuery().eq('workspaceId', workspaceId).in('parentId', frontier)
    );

    const newIds = children.map((child) => child.id).filter((id) => !descendants.has(id));
    for (const id of newIds) {
      descendants.add(id);
    }

    frontier = newIds;
  }

  return descendants;
}

/**
 * Ensures a `workspace-member` row (`role: 'app'`) exists for `toAppOwnerId(app.id)` when
 * `app.attributionMode === 'app'`, and removes it otherwise. This keeps App-attributed content
 * readable through the standard retrievers, which gate on `assertWorkspaceAccess` — without
 * this, reads against `"app--" + app.id`-owned content would fail with `NotFoundError` since no
 * `workspace-member` row would exist for that synthetic id. Called from the App create/update
 * (when `attributionMode` changes) and archive routes.
 */
export async function syncAppWorkspaceMembership(app: App): Promise<void> {
  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  const ownerId = toAppOwnerId(app.id);

  const existing = await workspaceMemberRepository.getOneByQuery(
    workspaceMemberRepository.createQuery().eq('workspaceId', app.workspaceId).eq('userId', ownerId)
  );

  const shouldExist = app.attributionMode === 'app' && !app.archivedAt;

  if (shouldExist && !existing) {
    await workspaceMemberRepository.create({
      workspaceId: app.workspaceId,
      userId: ownerId,
      role: 'app',
      createdAt: new Date().toISOString(),
    });
  } else if (!shouldExist && existing) {
    await workspaceMemberRepository.deleteUsingId(existing.id);
  }
}
