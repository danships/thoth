import { apiRoute } from '@/lib/api/route-wrapper';
import { getAppRepository, getAppScopedContainerRepository } from '@/lib/database';
import { addScopedContainer } from '@/lib/database/app-scope-service';
import { resolveContainerDescendants } from '@/lib/database/app-service';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { App } from '@thoth/database/types';
import type {
  ConnectPageAppBody,
  ConnectPageAppResponse,
  GetPageAppsResponse,
  PageAppSummary,
  PageAppsParameters,
} from '@/types/api';
import { connectPageAppBodySchema, pageAppsParametersSchema } from '@/types/api';

function summarizeApp(app: App): PageAppSummary {
  return {
    id: app.id,
    label: app.label,
    permission: app.permission,
    scopeType: app.scopeType,
  };
}

type ConnectionState = {
  connected: GetPageAppsResponse['connected'];
  connectable: GetPageAppsResponse['connectable'];
};

// Computes, for the page, which of `apps` are connected — directly (the page is in the App's
// scoped set), via workspace scope, or via inheritance (a `containers_with_children` App whose
// scoped set reaches this page as a descendant) — and which are merely connectable.
function computeConnectionState(
  container: { id: string },
  apps: App[],
  scopedIdsByApp: Map<string, string[]>,
  descendantsByApp: Map<string, Set<string>>
): ConnectionState {
  const connected: ConnectionState['connected'] = [];
  const connectable: ConnectionState['connectable'] = [];

  for (const app of apps) {
    const summary = summarizeApp(app);

    if (app.scopeType === 'workspace') {
      connected.push({ ...summary, viaWorkspace: true });
      continue;
    }

    const scopedIds = scopedIdsByApp.get(app.id) ?? [];
    if (scopedIds.includes(container.id)) {
      connected.push({ ...summary, viaWorkspace: false });
      continue;
    }

    if (descendantsByApp.get(app.id)?.has(container.id)) {
      connected.push({ ...summary, viaWorkspace: false, viaInheritance: true });
      continue;
    }

    connectable.push(summary);
  }

  return { connected, connectable };
}

// The "Apps" menu on a page's own detail screen manages which non-workspace-scoped Apps have
// access to *this* page — this is deliberately not part of the App settings form (see THOTH-026
// feedback): a page opts individual Apps in from its own screen, rather than an App having to
// enumerate every page it needs up front. Connecting an App to a page implicitly grants it
// access to the data sources embedded on that page, so those are never managed separately.
export const GET = apiRoute<GetPageAppsResponse, {}, PageAppsParameters, {}>(
  {
    disallowApiKey: true,
    expectedParamsSchema: pageAppsParametersSchema,
  },
  async ({ params }, session) => {
    const page = await pageRetriever.retrievePage(params.id, session.user.id);

    const appRepository = await getAppRepository();
    const rawApps = await appRepository.getByQuery(appRepository.createQuery().eq('workspaceId', page.workspaceId));
    const apps = rawApps.filter((app) => !app.archivedAt);

    // Load every scoped-container row for the workspace's non-workspace Apps in one query, then
    // group by App so the page's connection state can be evaluated without re-querying.
    const nonWorkspaceAppIds = apps.filter((app) => app.scopeType !== 'workspace').map((app) => app.id);
    const appScopedContainerRepository = await getAppScopedContainerRepository();
    const scopeRows =
      nonWorkspaceAppIds.length > 0
        ? await appScopedContainerRepository.getByQuery(
            appScopedContainerRepository.createQuery().in('appId', nonWorkspaceAppIds)
          )
        : [];

    const scopedIdsByApp = new Map<string, string[]>();
    for (const row of scopeRows) {
      const list = scopedIdsByApp.get(row.appId) ?? [];
      list.push(row.containerId);
      scopedIdsByApp.set(row.appId, list);
    }

    // Resolve each `containers_with_children` App's descendant set once for the page.
    const descendantsByApp = new Map<string, Set<string>>();
    for (const app of apps) {
      if (app.scopeType === 'containers_with_children') {
        const scopedIds = scopedIdsByApp.get(app.id) ?? [];
        descendantsByApp.set(
          app.id,
          scopedIds.length > 0 ? await resolveContainerDescendants(scopedIds, page.workspaceId) : new Set<string>()
        );
      }
    }

    return computeConnectionState(page, apps, scopedIdsByApp, descendantsByApp);
  }
);

export const POST = apiRoute<ConnectPageAppResponse, {}, PageAppsParameters, ConnectPageAppBody>(
  {
    disallowApiKey: true,
    expectedParamsSchema: pageAppsParametersSchema,
    expectedBodySchema: connectPageAppBodySchema,
  },
  async ({ params, body }, session) => {
    const page = await pageRetriever.retrievePage(params.id, session.user.id);

    const appRepository = await getAppRepository();
    const app = await appRepository.getOneByQuery(appRepository.createQuery().eq('id', body.appId));

    if (!app || app.workspaceId !== page.workspaceId) {
      throw new NotFoundError('App not found');
    }

    if (app.archivedAt) {
      throw new BadRequestError('Cannot connect an archived App');
    }

    if (app.scopeType === 'workspace') {
      throw new BadRequestError('This App already has access to every page in the workspace');
    }

    await addScopedContainer(app.id, page.id);

    return {
      id: app.id,
      label: app.label,
      permission: app.permission,
      scopeType: app.scopeType,
      viaWorkspace: false,
    };
  }
);
