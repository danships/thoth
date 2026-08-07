import { apiRoute } from '@/lib/api/route-wrapper';
import { assertPlatformAdmin } from '@/lib/auth/platform-user';
import { getPlatformUserRepository } from '@/lib/database';
import { deleteSetting, getSetting, setSetting } from '@/lib/settings/service';
import { STORAGE_QUOTA_BYTES_KEY } from '@/lib/settings/definitions';
import { getUserStorageUsage } from '@/lib/files/quota';
import { getLogger } from '@/lib/logger';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { AdminUserParameters, UpdateAdminUserBody, UpdateAdminUserResponse } from '@/types/api';
import { adminUserParametersSchema, updateAdminUserBodySchema } from '@/types/api';

// `PATCH /api/v1/admin/users/{id}` — set a user's storage quota (role is NOT writable here).
export const PATCH = apiRoute<UpdateAdminUserResponse, {}, AdminUserParameters, UpdateAdminUserBody>(
  {
    disallowApiKey: true,
    expectedParamsSchema: adminUserParametersSchema,
    expectedBodySchema: updateAdminUserBodySchema,
  },
  async ({ params, body }, session) => {
    const admin = await assertPlatformAdmin(session);

    const repository = await getPlatformUserRepository();
    const platformUser = await repository.getOneByQuery(repository.createQuery().eq('userId', params.id));
    if (!platformUser) {
      throw new NotFoundError('User not found');
    }

    const previousQuota = await getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: params.id });

    // `null` clears any user-level limit (delete the row so it falls back to the default);
    // a number sets an explicit limit.
    await (body.storageQuotaBytes === null
      ? deleteSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: params.id })
      : setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: params.id }, body.storageQuotaBytes));

    const [storageQuotaBytes, usedBytes] = await Promise.all([
      getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: params.id }),
      getUserStorageUsage(params.id),
    ]);

    const logger = await getLogger();
    logger.info('platform.user-quota.update', {
      actorUserId: admin.userId,
      targetUserId: params.id,
      before: previousQuota,
      after: storageQuotaBytes,
    });

    return {
      id: platformUser.userId,
      name: platformUser.name,
      email: platformUser.email,
      role: platformUser.role,
      storageQuotaBytes,
      usedBytes,
    };
  }
);
