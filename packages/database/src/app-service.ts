import crypto from 'node:crypto';
import {
  getApiKeyRepository,
  getAppRepository,
  getContainerRepository,
  getDataViewRepository,
  getWorkspaceMemberRepository,
} from './repositories.js';
import type { ApiKey, App, Container } from './types.js';

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
 * Iteratively expands `containerIds` to include every descendant, scoped to `workspaceId`.
 * Used by `access-grant.ts` for `scopeType === 'containers_with_children'`, resolved
 * dynamically at check time (never denormalized) so reparenting containers is automatically
 * reflected without touching any grant data.
 *
 * Descendants are reached two ways: (1) directly, via `Container.parentId` (nested pages, and
 * rows added under a data source); and (2) through the data sources a page embeds — rows added
 * from a data view are parented to the *data source* (`parentId = dataSourceId`), and the data
 * source itself has `parentId = null`, linked to its host page only via
 * `page.views -> dataView.dataSourceId`. Without bridging that link, pages shown inside a data
 * view on an in-scope page would be invisible to the grant. This mirrors, in the opposite
 * direction, the breadcrumb traversal that bridges a data source up to its host page (see
 * `pages/[id]/breadcrumbs`).
 */
export async function resolveContainerDescendants(containerIds: string[], workspaceId: string): Promise<Set<string>> {
  if (containerIds.length === 0) {
    return new Set<string>();
  }

  const containerRepository = await getContainerRepository();
  const dataViewRepository = await getDataViewRepository();
  const descendants = new Set<string>();

  // Seed the frontier with the actual container objects (not just ids) so a page's `views` can
  // be read to bridge into the data sources it embeds.
  let frontier: Container[] = await containerRepository.getByQuery(
    containerRepository.createQuery().eq('workspaceId', workspaceId).in('id', containerIds)
  );

  while (frontier.length > 0) {
    const frontierIds = frontier.map((container) => container.id);

    // 1. Containers nested directly via `parentId` (nested pages, and rows under a data source).
    const children = await containerRepository.getByQuery(
      containerRepository.createQuery().eq('workspaceId', workspaceId).in('parentId', frontierIds)
    );

    // 2. Data sources embedded in the frontier's pages via their data views.
    const viewIds = frontier.flatMap((container) => (container.type === 'page' ? (container.views ?? []) : []));
    let linkedDataSources: Container[] = [];
    if (viewIds.length > 0) {
      const dataViews = await dataViewRepository.getByQuery(
        dataViewRepository.createQuery().eq('workspaceId', workspaceId).in('id', viewIds)
      );
      const dataSourceIds = [...new Set(dataViews.map((dataView) => dataView.dataSourceId))];
      if (dataSourceIds.length > 0) {
        linkedDataSources = await containerRepository.getByQuery(
          containerRepository.createQuery().eq('workspaceId', workspaceId).in('id', dataSourceIds)
        );
      }
    }

    const nextFrontier: Container[] = [];
    for (const container of [...children, ...linkedDataSources]) {
      if (!descendants.has(container.id)) {
        descendants.add(container.id);
        nextFrontier.push(container);
      }
    }

    frontier = nextFrontier;
  }

  return descendants;
}

/**
 * Resolves the containers that are *implicitly* accessible through the given pages because they
 * are embedded on them: the `data-source` containers shown on the pages (via
 * `page.views -> dataView.dataSourceId`) plus the rows stored under those data sources
 * (`parentId = dataSourceId`). Used by `access-grant.ts` so that granting an App access to a
 * page implicitly grants access to the data (data source + its rows) displayed on that page —
 * regardless of scope type — since data sources are never granted on their own.
 */
export async function resolvePageEmbeddedContainerIds(pageIds: string[], workspaceId: string): Promise<Set<string>> {
  if (pageIds.length === 0) {
    return new Set<string>();
  }

  const containerRepository = await getContainerRepository();
  const scopedContainers = await containerRepository.getByQuery(
    containerRepository.createQuery().eq('workspaceId', workspaceId).in('id', pageIds)
  );

  const viewIds = scopedContainers.flatMap((container) => (container.type === 'page' ? (container.views ?? []) : []));
  if (viewIds.length === 0) {
    return new Set<string>();
  }

  const dataViewRepository = await getDataViewRepository();
  const dataViews = await dataViewRepository.getByQuery(
    dataViewRepository.createQuery().eq('workspaceId', workspaceId).in('id', viewIds)
  );

  const dataSourceIds = [...new Set(dataViews.map((dataView) => dataView.dataSourceId))];
  if (dataSourceIds.length === 0) {
    return new Set<string>();
  }

  const embedded = new Set<string>(dataSourceIds);

  // The rows displayed by those data views live under the data source container.
  const rows = await containerRepository.getByQuery(
    containerRepository.createQuery().eq('workspaceId', workspaceId).in('parentId', dataSourceIds)
  );
  for (const row of rows) {
    embedded.add(row.id);
  }

  return embedded;
}

/**
 * Returns every live page that embeds `dataSourceId` through one of its live data views.
 *
 * This is the reverse of `resolvePageEmbeddedContainerIds`: a row's `parentId` points to its
 * data source, while the data source points back to its host page only through
 * `page.views -> dataView.dataSourceId`. A data source may be embedded by more than one page.
 */
export async function resolveHostPageIdsForDataSource(dataSourceId: string, workspaceId: string): Promise<string[]> {
  const dataViewRepository = await getDataViewRepository();
  const dataViews = await dataViewRepository.getByQuery(
    dataViewRepository.createQuery().eq('dataSourceId', dataSourceId).eq('workspaceId', workspaceId)
  );
  const dataViewIds = new Set(dataViews.filter((dataView) => !dataView.deletedAt).map((dataView) => dataView.id));

  if (dataViewIds.size === 0) {
    return [];
  }

  const containerRepository = await getContainerRepository();
  const pages = await containerRepository.getByQuery(
    containerRepository.createQuery().eq('type', 'page').eq('workspaceId', workspaceId)
  );

  return [
    ...new Set(
      pages
        .filter(
          (page): page is Extract<Container, { type: 'page' }> =>
            page.type === 'page' && !page.deletedAt && (page.views ?? []).some((viewId) => dataViewIds.has(viewId))
        )
        .map((page) => page.id)
    ),
  ];
}

/**
 * Resolves the live ancestors of a changed container for notification-rule matching.
 *
 * Ancestors are nearest-first (breadth-first by graph hop) and exclude the changed container.
 * In addition to `parentId`, the walk bridges a data source to every live page that embeds it;
 * this makes host-page subtree subscriptions cover edits to embedded data-source rows (THOTH-080).
 */
export async function resolveLiveAncestorIdsBridgingDataSources(input: {
  workspaceId: string;
  container: Pick<Container, 'id' | 'type' | 'parentId'>;
  maxAncestors?: number;
}): Promise<string[]> {
  const maxAncestors = input.maxAncestors ?? 200;
  const containerRepository = await getContainerRepository();
  const ancestors: string[] = [];
  const visited = new Set<string>([input.container.id]);
  const queued = new Set<string>([input.container.id]);
  const queue: string[] = [];

  const enqueue = (id: string | null): void => {
    if (id && !visited.has(id) && !queued.has(id)) {
      queued.add(id);
      queue.push(id);
    }
  };

  if (input.container.type === 'data-source') {
    for (const hostPageId of await resolveHostPageIdsForDataSource(input.container.id, input.workspaceId)) {
      enqueue(hostPageId);
    }
  } else {
    enqueue(input.container.parentId);
  }

  while (queue.length > 0 && ancestors.length < maxAncestors) {
    const id = queue.shift();
    if (!id || visited.has(id)) {
      continue;
    }
    visited.add(id);

    const ancestor = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', id).eq('workspaceId', input.workspaceId)
    );
    if (!ancestor || ancestor.deletedAt) {
      continue;
    }

    ancestors.push(ancestor.id);
    if (ancestors.length >= maxAncestors) {
      break;
    }

    if (ancestor.type === 'data-source') {
      for (const hostPageId of await resolveHostPageIdsForDataSource(ancestor.id, input.workspaceId)) {
        enqueue(hostPageId);
      }
    } else {
      enqueue(ancestor.parentId);
    }
  }

  return ancestors;
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
      // The synthetic `app` membership row exists only so App-attributed content passes the
      // membership check; the App's real grant is always `session.appContext.accessGrant`,
      // never this row's permission/scopeType (see `assertContentAccess`).
      permission: 'read_write',
      scopeType: 'workspace',
      createdAt: new Date().toISOString(),
    });
  } else if (!shouldExist && existing) {
    await workspaceMemberRepository.deleteUsingId(existing.id);
  }
}
