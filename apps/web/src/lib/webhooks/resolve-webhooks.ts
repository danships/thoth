import { getAppRepository, getContainerRepository, getWebhookRepository } from '@/lib/database';
import { appToAccessGrant, grantAllowsContainer } from '@/lib/auth/access-grant';
import type { App, Container, DataSourceContainer, Webhook } from '@thoth/database/types';

export type WebhookActor = {
  // The id of the App whose own API key caused the change, if any (undefined for a
  // session-cookie-driven change) — used for `suppressOwnChanges` matching.
  appId?: string | undefined;
};

/**
 * Reverse of `filterContainersByGrant`: given a changed container, finds every enabled webhook
 * whose owning App's `AccessGrant` covers it (or, for a data-source page, covers its parent data
 * source — see "Data-source rule" below), excluding archived Apps and honouring per-webhook
 * `suppressOwnChanges`. Dedupes by `webhook.id`.
 *
 * `parentDataSource` is the container's already-resolved data-source parent (see
 * `resolveDataSourceParent`), passed in so callers that also need it (e.g. `notifyPageChange`
 * for the outbound payload) don't trigger the lookup twice.
 */
export async function resolveWebhooksToNotify(
  container: Container,
  workspaceId: string,
  actor: WebhookActor,
  parentDataSource?: DataSourceContainer
): Promise<Webhook[]> {
  const webhookRepository = await getWebhookRepository();
  const candidateWebhooks = await webhookRepository.getByQuery(
    webhookRepository.createQuery().eq('workspaceId', workspaceId).eq('enabled', true)
  );

  if (candidateWebhooks.length === 0) {
    return [];
  }

  const appRepository = await getAppRepository();
  const appIds = [...new Set(candidateWebhooks.map((webhook) => webhook.appId))];
  const apps = await appRepository.getByQuery(appRepository.createQuery().in('id', appIds));
  const appsById = new Map<string, App>(apps.filter((app) => !app.archivedAt).map((app) => [app.id, app]));

  const grantCache = new Map<string, ReturnType<typeof appToAccessGrant>>();
  const matched = new Map<string, Webhook>();

  for (const webhook of candidateWebhooks) {
    if (matched.has(webhook.id)) {
      continue;
    }

    const app = appsById.get(webhook.appId);
    if (!app) {
      continue;
    }

    if (webhook.suppressOwnChanges && actor.appId === webhook.appId) {
      continue;
    }

    let grantPromise = grantCache.get(app.id);
    if (!grantPromise) {
      grantPromise = appToAccessGrant(app);
      grantCache.set(app.id, grantPromise);
    }
    const grant = await grantPromise;

    const allowsContainer = await grantAllowsContainer(grant, container);
    const allowsParent = parentDataSource ? await grantAllowsContainer(grant, parentDataSource) : false;

    if (allowsContainer || allowsParent) {
      matched.set(webhook.id, webhook);
    }
  }

  return [...matched.values()];
}

/** Resolves a page's data-source parent, if any — `undefined` for root pages or non-page containers. */
export async function resolveDataSourceParent(container: Container): Promise<DataSourceContainer | undefined> {
  if (container.type !== 'page' || !container.parentId) {
    return undefined;
  }
  const containerRepository = await getContainerRepository();
  const parent = await containerRepository.getOneByQuery(
    containerRepository.createQuery().eq('id', container.parentId).eq('workspaceId', container.workspaceId)
  );
  return parent && parent.type === 'data-source' ? parent : undefined;
}
