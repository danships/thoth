import { apiRoute } from '@/lib/api/route-wrapper';
import {
  getWorkspaceMemberRepository,
  getWorkspaceRepository,
  getWorkspaceSlugRedirectRepository,
} from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { reserveWorkspaceSlug, WorkspaceSlugConflictError } from '@/lib/database/workspace-slug';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { getSetting } from '@/lib/settings/service';
import { STORAGE_QUOTA_BYTES_KEY } from '@/lib/settings/definitions';
import { getLogger } from '@/lib/logger';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { ForbiddenError } from '@/lib/errors/forbidden-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { ConflictError } from '@/lib/errors/conflict-error';
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
      throw new ForbiddenError('Only the workspace owner can update this workspace');
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
      try {
        updated = await reserveWorkspaceSlug(body.slug, async () => {
          // Persist the slug change first — the redirect is only created once the rename has
          // actually succeeded, so a failed update never leaves a dangling redirect for a slug
          // change that never happened.
          const result = await workspaceRepository.update({
            ...existing,
            slug: body.slug!,
            lastUpdated: now,
          });

          const redirectRepository = await getWorkspaceSlugRedirectRepository();
          await redirectRepository.create({
            slug: oldSlug,
            workspaceId: existing.id,
            createdAt: now,
          });

          return result;
        });
      } catch (error) {
        if (error instanceof WorkspaceSlugConflictError) {
          throw new ConflictError(error.message);
        }
        throw error;
      }

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

    const storageQuotaBytes = await getSetting(STORAGE_QUOTA_BYTES_KEY, {
      scope: 'workspace',
      subjectId: updated.id,
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      createdAt: updated.createdAt,
      lastUpdated: updated.lastUpdated,
      storageQuotaBytes,
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
      throw new ForbiddenError('Only the workspace owner can delete this workspace');
    }

    const workspaceRepository = await getWorkspaceRepository();
    const workspaceMemberRepository = await getWorkspaceMemberRepository();

    const existing = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', params.id));
    if (!existing) {
      throw new NotFoundError('Workspace not found');
    }

    // Guard: a user must always have at least one active workspace.
    const ownMemberships = await workspaceMemberRepository.getByQuery(
      addUserIdToQuery(workspaceMemberRepository.createQuery(), session.user.id)
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
