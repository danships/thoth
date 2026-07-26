import { apiRoute } from '@/lib/api/route-wrapper';
import {
  getWorkspaceMemberRepository,
  getWorkspaceRepository,
  getWorkspaceSlugRedirectRepository,
} from '@/lib/database';
import { reserveWorkspaceSlug } from '@/lib/database/workspace-slug';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { getLogger } from '@/lib/logger';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type {
  DeleteWorkspaceParameters,
  UpdateWorkspaceBody,
  UpdateWorkspaceParameters,
  UpdateWorkspaceResponse,
} from '@/types/api';
import {
  deleteWorkspaceParametersSchema,
  updateWorkspaceBodySchema,
  updateWorkspaceParametersSchema,
} from '@/types/api';

export const PATCH = apiRoute<UpdateWorkspaceResponse, undefined, UpdateWorkspaceParameters, UpdateWorkspaceBody>(
  {
    expectedBodySchema: updateWorkspaceBodySchema,
    expectedParamsSchema: updateWorkspaceParametersSchema,
  },
  async ({ body, params }, session) => {
    const membership = await assertWorkspaceAccess(session.user.id, params.id);
    if (membership.role !== 'owner') {
      throw new BadRequestError('Only the workspace owner can update this workspace');
    }

    const workspaceRepository = await getWorkspaceRepository();
    const existing = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', params.id));
    if (!existing) {
      throw new NotFoundError('Workspace not found');
    }

    const logger = await getLogger();
    const now = new Date().toISOString();
    let updated = existing;

    if (body.slug && body.slug !== existing.slug) {
      const oldSlug = existing.slug;
      updated = await reserveWorkspaceSlug(body.slug, async () => {
        const redirectRepository = await getWorkspaceSlugRedirectRepository();
        await redirectRepository.create({
          slug: oldSlug,
          workspaceId: existing.id,
          createdAt: now,
        });

        return workspaceRepository.update({
          ...existing,
          slug: body.slug!,
          lastUpdated: now,
        });
      });

      logger.info('workspace.rename', {
        actorUserId: session.user.id,
        workspaceId: existing.id,
        oldSlug,
        newSlug: body.slug,
      });
    }

    if (body.name && body.name !== updated.name) {
      updated = await workspaceRepository.update({
        ...updated,
        name: body.name,
        lastUpdated: now,
      });
    }

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      createdAt: updated.createdAt,
      lastUpdated: updated.lastUpdated,
    };
  }
);

export const DELETE = apiRoute<void, undefined, DeleteWorkspaceParameters, {}>(
  {
    expectedParamsSchema: deleteWorkspaceParametersSchema,
  },
  async ({ params }, session) => {
    const membership = await assertWorkspaceAccess(session.user.id, params.id);
    if (membership.role !== 'owner') {
      throw new BadRequestError('Only the workspace owner can delete this workspace');
    }

    const workspaceRepository = await getWorkspaceRepository();
    const workspaceMemberRepository = await getWorkspaceMemberRepository();

    const existing = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', params.id));
    if (!existing) {
      throw new NotFoundError('Workspace not found');
    }

    // Guard: a user must always have at least one active workspace.
    const ownMemberships = await workspaceMemberRepository.getByQuery(
      workspaceMemberRepository.createQuery().eq('userId', session.user.id)
    );
    const ownWorkspaces = await workspaceRepository.getByQuery(
      workspaceRepository.createQuery().in(
        'id',
        ownMemberships.map((m) => m.workspaceId)
      )
    );
    const activeWorkspaceCount = ownWorkspaces.filter((workspace) => !workspace.deletedAt).length;

    if (activeWorkspaceCount <= 1) {
      throw new BadRequestError('Cannot delete your only workspace');
    }

    await workspaceRepository.update({
      ...existing,
      deletedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });

    const logger = await getLogger();
    logger.info('workspace.delete', {
      actorUserId: session.user.id,
      workspaceId: existing.id,
      workspaceName: existing.name,
    });
  }
);
