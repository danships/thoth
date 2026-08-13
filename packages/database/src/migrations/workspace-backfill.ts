import type { SuperSave } from 'supersave';
import * as entities from '../entities/index.js';
import { generateUniqueWorkspaceSlug } from '../workspace-slug.js';
import type { Workspace, WorkspaceMemberCreate } from '../types.js';

/**
 * One-time backfill for existing `Workspace` rows created before multi-workspace support:
 * assigns a globally-unique `slug`, creates the owning `WorkspaceMember(role: 'owner')` row
 * from `workspace.userId`, and normalizes `deletedAt` to `null` where undefined.
 *
 * Runs as a SuperSave `Migration` (not a standalone script) so it executes automatically,
 * exactly once, on the next boot after this change is deployed — mirroring the existing
 * `better-auth-tables` migration.
 */
export async function backfillWorkspaces(superSave: SuperSave): Promise<void> {
  const workspaceRepository = superSave.getRepository<Workspace>(entities.WORKSPACE_NAME);
  const workspaceMemberRepository = superSave.getRepository<WorkspaceMemberCreate & { id: string }>(
    entities.WORKSPACE_MEMBER_NAME
  );

  const workspaces = await workspaceRepository.getByQuery(workspaceRepository.createQuery());

  for (const workspace of workspaces) {
    let needsUpdate = false;
    const updated: Workspace = { ...workspace };

    if (!updated.slug) {
      updated.slug = await generateUniqueWorkspaceSlug(updated.name || 'workspace');
      needsUpdate = true;
    }

    // Normalize explicitly (rather than leaving it `undefined`) so downstream code can rely
    // on `deletedAt` always being present.
    if (updated.deletedAt === undefined) {
      updated.deletedAt = null;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await workspaceRepository.update(updated);
    }

    const existingMember = await workspaceMemberRepository.getOneByQuery(
      workspaceMemberRepository.createQuery().eq('workspaceId', workspace.id).eq('userId', workspace.userId)
    );

    if (!existingMember) {
      await workspaceMemberRepository.create({
        workspaceId: workspace.id,
        userId: workspace.userId,
        role: 'owner',
        permission: 'read_write',
        scopeType: 'workspace',
        createdAt: workspace.createdAt ?? new Date().toISOString(),
      });
    }
  }
}
