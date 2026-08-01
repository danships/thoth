import { apiRoute } from '@/lib/api/route-wrapper';
import { getWorkspaceMemberRepository, getWorkspaceRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { createWorkspaceForUser } from '@/lib/database/seed-workspace';
import { DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES } from '@/types/schemas/entities/workspace';
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

  return workspaces
    .filter((workspace) => !workspace.deletedAt)
    .map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: workspace.createdAt,
      lastUpdated: workspace.lastUpdated,
      storageQuotaBytes: workspace.storageQuotaBytes ?? DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES,
    }));
});

export const POST = apiRoute<CreateWorkspaceResponse, {}, {}, CreateWorkspaceBody>(
  {
    expectedBodySchema: createWorkspaceBodySchema,
  },
  async ({ body }, session) => {
    const workspace = await createWorkspaceForUser(session.user.id, body.name, {
      ...(body.slug ? { slug: body.slug } : {}),
      nameOverride: body.name,
      strict: true,
    });

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: workspace.createdAt,
      lastUpdated: workspace.lastUpdated,
      storageQuotaBytes: workspace.storageQuotaBytes ?? DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES,
    };
  }
);
