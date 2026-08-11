import { apiRoute } from '@/lib/api/route-wrapper';
import { getWorkspaceMemberRepository, getWorkspaceRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { createWorkspaceForUser } from '@/lib/database/seed-workspace';
import { WorkspaceSlugConflictError } from '@/lib/database/workspace-slug';
import { canCreateWorkspace } from '@/lib/settings/workspace-policy';
import { getSetting, getSettingsForSubjects } from '@/lib/settings/service';
import { STORAGE_QUOTA_BYTES_KEY } from '@/lib/settings/definitions';
import { ForbiddenError } from '@/lib/errors/forbidden-error';
import { ConflictError } from '@/lib/errors/conflict-error';
import type { CreateWorkspaceBody, CreateWorkspaceResponse, GetWorkspacesResponse } from '@/types/api';
import { createWorkspaceBodySchema } from '@/types/api';

export const GET = apiRoute<GetWorkspacesResponse, {}, {}, {}>({}, async (_request, session) => {
  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  const memberships = await workspaceMemberRepository.getByQuery(
    addUserIdToQuery(workspaceMemberRepository.createQuery(), session.user.id)
  );

  if (memberships.length === 0) {
    return [];
  }

  const workspaceRepository = await getWorkspaceRepository();
  const workspaces = await workspaceRepository.getByQuery(
    workspaceRepository.createQuery().in(
      'id',
      memberships.map((membership) => membership.workspaceId)
    )
  );

  const active = workspaces.filter((workspace) => !workspace.deletedAt);
  const quotas = await getSettingsForSubjects(
    STORAGE_QUOTA_BYTES_KEY,
    'workspace',
    active.map((workspace) => workspace.id)
  );

  return active.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    createdAt: workspace.createdAt,
    lastUpdated: workspace.lastUpdated,
    storageQuotaBytes: quotas.get(workspace.id) ?? null,
  }));
});

export const POST = apiRoute<CreateWorkspaceResponse, {}, {}, CreateWorkspaceBody>(
  {
    // Workspace creation is a genuine-human action gated by the platform self-service policy —
    // API keys can never create workspaces (THOTH-045).
    disallowApiKey: true,
    expectedBodySchema: createWorkspaceBodySchema,
  },
  async ({ body }, session) => {
    if (!(await canCreateWorkspace(session))) {
      throw new ForbiddenError('Workspace creation is disabled by your platform administrator');
    }

    let workspace;
    try {
      workspace = await createWorkspaceForUser(session.user.id, body.name, {
        ...(body.slug ? { slug: body.slug } : {}),
        nameOverride: body.name,
        strict: true,
      });
    } catch (error) {
      if (error instanceof WorkspaceSlugConflictError) {
        throw new ConflictError(error.message);
      }
      throw error;
    }

    const storageQuotaBytes = await getSetting(STORAGE_QUOTA_BYTES_KEY, {
      scope: 'workspace',
      subjectId: workspace.id,
    });

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: workspace.createdAt,
      lastUpdated: workspace.lastUpdated,
      storageQuotaBytes,
    };
  }
);
