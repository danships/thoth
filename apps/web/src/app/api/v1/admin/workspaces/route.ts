import { apiRoute } from '@/lib/api/route-wrapper';
import { assertPlatformAdmin } from '@/lib/auth/platform-user';
import { getWorkspaceRepository } from '@/lib/database';
import { getSettingsForSubjects } from '@/lib/settings/service';
import { STORAGE_QUOTA_BYTES_KEY } from '@/lib/settings/definitions';
import { getWorkspaceStorageUsage } from '@/lib/files/quota';
import type { AdminWorkspaceItem, GetAdminWorkspacesQuery, GetAdminWorkspacesResponse } from '@/types/api';
import { getAdminWorkspacesQuerySchema } from '@/types/api';
import type { Workspace } from '@thoth/database/types';

const DEFAULT_LIMIT = 50;

function sortWorkspaces(workspaces: Workspace[]): Workspace[] {
  return workspaces.toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

function matchesSearch(workspace: Workspace, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle.length === 0) {
    return true;
  }
  return (
    workspace.id === search.trim() ||
    workspace.name.toLowerCase().includes(needle) ||
    workspace.slug.toLowerCase().includes(needle)
  );
}

export const GET = apiRoute<GetAdminWorkspacesResponse, GetAdminWorkspacesQuery, {}, {}>(
  {
    disallowApiKey: true,
    expectedQuerySchema: getAdminWorkspacesQuerySchema,
  },
  async ({ query }, session) => {
    await assertPlatformAdmin(session);

    const limit = query?.limit ?? DEFAULT_LIMIT;
    const includeDeleted = query?.includeDeleted ?? false;

    const repository = await getWorkspaceRepository();
    const all = await repository.getByQuery(repository.createQuery());

    let filtered = sortWorkspaces(all);
    if (!includeDeleted) {
      filtered = filtered.filter((workspace) => !workspace.deletedAt);
    }
    if (query?.search) {
      filtered = filtered.filter((workspace) => matchesSearch(workspace, query.search!));
    }

    if (query?.cursor) {
      const cursorIndex = filtered.findIndex((workspace) => workspace.id === query.cursor);
      if (cursorIndex !== -1) {
        filtered = filtered.slice(cursorIndex + 1);
      }
    }

    const page = filtered.slice(0, limit);
    const nextCursor = filtered.length > limit ? (page.at(-1)?.id ?? null) : null;

    const quotas = await getSettingsForSubjects(
      STORAGE_QUOTA_BYTES_KEY,
      'workspace',
      page.map((workspace) => workspace.id)
    );

    const items: AdminWorkspaceItem[] = await Promise.all(
      page.map(async (workspace) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        deletedAt: workspace.deletedAt ?? null,
        storageQuotaBytes: quotas.get(workspace.id) ?? null,
        usedBytes: await getWorkspaceStorageUsage(workspace.id),
      }))
    );

    return { items, nextCursor };
  }
);
