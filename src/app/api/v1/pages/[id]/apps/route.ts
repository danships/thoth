import { apiRoute } from '@/lib/api/route-wrapper';
import { getAppRepository, getAppScopedContainerRepository } from '@/lib/database';
import { addScopedContainer } from '@/lib/database/app-scope-service';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { ConnectPageAppBody, ConnectPageAppResponse, GetPageAppsResponse, PageAppsParameters } from '@/types/api';
import { connectPageAppBodySchema, pageAppsParametersSchema } from '@/types/api';

// The "Apps" menu on a page's own detail screen manages which non-workspace-scoped Apps have
// access to *this* page — this is deliberately not part of the App settings form (see
// THOTH-026 feedback): a page opts individual Apps in from its own screen, rather than an App
// having to enumerate every page it needs up front.
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

    const appScopedContainerRepository = await getAppScopedContainerRepository();
    const scopedRows = await appScopedContainerRepository.getByQuery(
      appScopedContainerRepository.createQuery().eq('containerId', page.id)
    );
    const directlyConnectedAppIds = new Set(scopedRows.map((row) => row.appId));

    const connected = apps
      .filter((app) => app.scopeType === 'workspace' || directlyConnectedAppIds.has(app.id))
      .map((app) => ({
        id: app.id,
        label: app.label,
        permission: app.permission,
        scopeType: app.scopeType,
        viaWorkspace: app.scopeType === 'workspace',
      }));

    const connectable = apps
      .filter((app) => app.scopeType !== 'workspace' && !directlyConnectedAppIds.has(app.id))
      .map((app) => ({
        id: app.id,
        label: app.label,
        permission: app.permission,
        scopeType: app.scopeType,
      }));

    return { connected, connectable };
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
