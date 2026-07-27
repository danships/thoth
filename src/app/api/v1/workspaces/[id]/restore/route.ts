import { apiRoute } from '@/lib/api/route-wrapper';
import { getWorkspaceMemberRepository, getWorkspaceRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { generateUniqueWorkspaceSlug } from '@/lib/database/workspace-slug';
import { getWorkspaceDeleteGracePeriodDays } from '@/lib/database/workspace-grace-period';
import { getLogger } from '@/lib/logger';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { HttpError } from '@/lib/errors/http-error';
import type { RestoreWorkspaceParameters, RestoreWorkspaceResponse } from '@/types/api';
import { restoreWorkspaceParametersSchema } from '@/types/api';

export const POST = apiRoute<RestoreWorkspaceResponse, undefined, RestoreWorkspaceParameters, {}>(
  {
    expectedParamsSchema: restoreWorkspaceParametersSchema,
  },
  async ({ params }, session) => {
    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', params.id));

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const workspaceMemberRepository = await getWorkspaceMemberRepository();
    const membership = await workspaceMemberRepository.getOneByQuery(
      addUserIdToQuery(workspaceMemberRepository.createQuery().eq('workspaceId', params.id), session.user.id)
    );

    if (!membership || membership.role !== 'owner') {
      throw new NotFoundError('Workspace not found');
    }

    if (!workspace.deletedAt) {
      // Not deleted at all — nothing to restore, treat the same as "not found" per the
      // documented restore semantics.
      throw new NotFoundError('Workspace not found');
    }

    const deletedAtMs = Date.parse(workspace.deletedAt);
    const gracePeriodDays = await getWorkspaceDeleteGracePeriodDays();
    const graceThresholdMs = Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000;
    if (Number.isNaN(deletedAtMs) || deletedAtMs <= graceThresholdMs) {
      throw new HttpError('Grace period has expired for this workspace', 410, true);
    }

    // If the slug has since been claimed by another *active* workspace, auto-assign a
    // temporary, de-duplicated one so the workspace is immediately reachable — the owner can
    // rename it later from Settings. A slug held by another soft-deleted workspace doesn't
    // count as taken, matching `reserveWorkspaceSlug`'s collision rules.
    const workspaceRepository2 = workspaceRepository;
    const conflicting = await workspaceRepository2.getByQuery(
      workspaceRepository2.createQuery().eq('slug', workspace.slug)
    );
    const slugTaken = conflicting.some((candidate) => candidate.id !== workspace.id && !candidate.deletedAt);

    const slug = slugTaken ? await generateUniqueWorkspaceSlug(`${workspace.name}-restored`) : workspace.slug;

    const restored = await workspaceRepository.update({
      ...workspace,
      slug,
      deletedAt: null,
      lastUpdated: new Date().toISOString(),
    });

    const logger = await getLogger();
    logger.info('workspace.restore', {
      actorUserId: session.user.id,
      workspaceId: restored.id,
      slug: restored.slug,
    });

    return {
      id: restored.id,
      name: restored.name,
      slug: restored.slug,
      createdAt: restored.createdAt,
      lastUpdated: restored.lastUpdated,
    };
  }
);
