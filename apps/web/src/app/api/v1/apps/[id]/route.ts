import { apiRoute } from '@/lib/api/route-wrapper';
import { getApiKeyRepository, getAppRepository } from '@/lib/database';
import { syncAppWorkspaceMembership } from '@/lib/database/app-service';
import { resolveOwnerDisplay } from '@/lib/database/owner-display-service';
import { hydrateAppResponse } from '@/lib/database/app-response';
import { appRetriever } from '@/lib/database/retrievers/app-retriever';
import { deleteWebhooksForApp } from '@/lib/database/webhook-service';
import {
  assertContainerIdsBelongToWorkspace,
  clearScopedContainers,
  replaceScopedContainers,
  InvalidContainerIdsError,
} from '@/lib/database/app-scope-service';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import type { AppDetailResponse, AppParameters, UpdateAppBody, UpdateAppResponse } from '@/types/api';
import { appParametersSchema, updateAppBodySchema } from '@/types/api';

export const GET = apiRoute<AppDetailResponse, {}, AppParameters, {}>(
  {
    disallowApiKey: true,
    expectedParamsSchema: appParametersSchema,
  },
  async ({ params }, session) => {
    const app = await appRetriever.retrieveApp(params.id, session.user.id);

    const [response, keys, ownerDisplay] = await Promise.all([
      hydrateAppResponse(app, { includeChildCount: true }),
      listAppKeys(app.id),
      resolveOwnerDisplay(app.createdByUserId),
    ]);

    return {
      ...response,
      keys,
      createdByDisplayName: ownerDisplay.name,
    };
  }
);

export const PATCH = apiRoute<UpdateAppResponse, undefined, AppParameters, UpdateAppBody>(
  {
    disallowApiKey: true,
    expectedBodySchema: updateAppBodySchema,
    expectedParamsSchema: appParametersSchema,
  },
  async ({ params, body }, session) => {
    const existingApp = await appRetriever.retrieveApp(params.id, session.user.id);

    const nextScopeType = body.scopeType ?? existingApp.scopeType;

    if (body.containerIds && nextScopeType !== 'workspace') {
      try {
        await assertContainerIdsBelongToWorkspace(body.containerIds, existingApp.workspaceId);
      } catch (error) {
        if (error instanceof InvalidContainerIdsError) {
          throw new BadRequestError(error.message);
        }
        throw error;
      }
    }

    const appRepository = await getAppRepository();
    const updatedApp = await appRepository.update({
      ...existingApp,
      label: body.label ?? existingApp.label,
      permission: body.permission ?? existingApp.permission,
      scopeType: nextScopeType,
      attributionMode: body.attributionMode ?? existingApp.attributionMode,
      lastUpdated: new Date().toISOString(),
    });

    // Switching to `scopeType: 'workspace'` deletes all scoped-container rows; switching
    // to/staying on a container scope with a new `containerIds` replaces the full set
    // (delete-then-recreate). No `containerIds` supplied while staying container-scoped
    // leaves the existing scoped set untouched.
    if (nextScopeType === 'workspace') {
      await clearScopedContainers(updatedApp.id);
    } else if (body.containerIds) {
      await replaceScopedContainers(updatedApp.id, body.containerIds);
    }

    if (body.attributionMode && body.attributionMode !== existingApp.attributionMode) {
      await syncAppWorkspaceMembership(updatedApp);
    }

    return hydrateAppResponse(updatedApp);
  }
);

export const DELETE = apiRoute<void, undefined, AppParameters, {}>(
  {
    disallowApiKey: true,
    expectedParamsSchema: appParametersSchema,
  },
  async ({ params }, session) => {
    const existingApp = await appRetriever.retrieveApp(params.id, session.user.id);

    const now = new Date().toISOString();

    const appRepository = await getAppRepository();
    const archivedApp = await appRepository.update({
      ...existingApp,
      archivedAt: now,
      lastUpdated: now,
    });

    // Cascade-revoke every non-revoked key under the App in the same request — soft-delete
    // only, App/ApiKey rows are retained for history.
    const apiKeyRepository = await getApiKeyRepository();
    const keys = await apiKeyRepository.getByQuery(apiKeyRepository.createQuery().eq('appId', existingApp.id));
    for (const key of keys) {
      if (!key.revokedAt) {
        await apiKeyRepository.update({ ...key, revokedAt: now });
      }
    }

    // Archiving always removes the `role: 'app'` workspace-membership row (if any) — an
    // archived App can no longer attribute new content, so it shouldn't retain membership.
    await syncAppWorkspaceMembership(archivedApp);

    // Cascade-delete every webhook (+ delivery history) owned by the App — an archived App can
    // no longer receive notifications, and its webhooks/secrets shouldn't linger.
    await deleteWebhooksForApp(existingApp.id);
  }
);

async function listAppKeys(appId: string) {
  const apiKeyRepository = await getApiKeyRepository();
  const keys = await apiKeyRepository.getByQuery(
    apiKeyRepository.createQuery().eq('appId', appId).sort('createdAt', 'desc')
  );

  return keys.map((key) => ({
    id: key.id,
    label: key.label,
    keyPrefix: key.keyPrefix,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
  }));
}
