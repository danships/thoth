import { apiRoute } from '@/lib/api/route-wrapper';
import { assertPlatformAdmin } from '@/lib/auth/platform-user';
import { getSetting, setSetting } from '@/lib/settings/service';
import {
  PLATFORM_SETTING_SUBJECT_ID,
  STORAGE_QUOTA_BYTES_KEY,
  WORKSPACE_CREATION_SELF_SERVICE_KEY,
} from '@/lib/settings/definitions';
import { getPlatformStorageUsage } from '@/lib/files/quota';
import { getLogger } from '@/lib/logger';
import type { AdminSettingsResponse, UpdateAdminSettingsBody } from '@/types/api';
import { updateAdminSettingsBodySchema } from '@/types/api';

async function loadAdminSettings(): Promise<AdminSettingsResponse> {
  const [allowUserWorkspaceCreation, storageQuotaBytes, usedBytes] = await Promise.all([
    getSetting(WORKSPACE_CREATION_SELF_SERVICE_KEY, { scope: 'platform' }),
    getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'platform', subjectId: PLATFORM_SETTING_SUBJECT_ID }),
    getPlatformStorageUsage(),
  ]);

  return { allowUserWorkspaceCreation, storageQuotaBytes, usedBytes };
}

export const GET = apiRoute<AdminSettingsResponse, {}, {}, {}>(
  {
    disallowApiKey: true,
  },
  async (_request, session) => {
    await assertPlatformAdmin(session);
    return loadAdminSettings();
  }
);

export const PATCH = apiRoute<AdminSettingsResponse, {}, {}, UpdateAdminSettingsBody>(
  {
    disallowApiKey: true,
    expectedBodySchema: updateAdminSettingsBodySchema,
  },
  async ({ body }, session) => {
    const admin = await assertPlatformAdmin(session);

    const before = await loadAdminSettings();

    if (body.allowUserWorkspaceCreation !== undefined) {
      await setSetting(WORKSPACE_CREATION_SELF_SERVICE_KEY, { scope: 'platform' }, body.allowUserWorkspaceCreation);
    }
    if (body.storageQuotaBytes !== undefined) {
      await setSetting(
        STORAGE_QUOTA_BYTES_KEY,
        { scope: 'platform', subjectId: PLATFORM_SETTING_SUBJECT_ID },
        body.storageQuotaBytes
      );
    }

    const after = await loadAdminSettings();

    const logger = await getLogger();
    logger.info('platform.settings.update', {
      actorUserId: admin.userId,
      before: {
        allowUserWorkspaceCreation: before.allowUserWorkspaceCreation,
        storageQuotaBytes: before.storageQuotaBytes,
      },
      after: {
        allowUserWorkspaceCreation: after.allowUserWorkspaceCreation,
        storageQuotaBytes: after.storageQuotaBytes,
      },
    });

    return after;
  }
);
