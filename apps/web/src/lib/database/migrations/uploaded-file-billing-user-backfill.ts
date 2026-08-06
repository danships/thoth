import type { SuperSave } from 'supersave';
import * as entities from '../entities';
import type { App, UploadedFile } from '@/types/database';
import { parseAppOwnerId } from '../app-service';

/**
 * One-time backfill for THOTH-045: populates `billingUserId` on existing `uploaded-file` rows.
 * For normal user-owned rows it copies `userId`; for App-attributed rows (`userId` is the
 * synthetic `app--<id>` identity) it resolves the owning App and uses its `createdByUserId`, so
 * the per-user storage quota is charged to a real human. Idempotent.
 *
 * Fails loudly (throws) if an App-attributed row can't be resolved to an App, rather than
 * silently skipping — an unresolved billing owner would let uploads escape user-level quotas.
 *
 * Uses `superSave.getRepository` directly (runs inside `runMigrations()`; awaiting the cached
 * `getDatabase()` promise here would deadlock).
 */
export async function backfillUploadedFileBillingUser(superSave: SuperSave): Promise<void> {
  const uploadedFileRepository = superSave.getRepository<UploadedFile>(entities.UPLOADED_FILE_NAME);
  const appRepository = superSave.getRepository<App>(entities.APP_NAME);

  const files = await uploadedFileRepository.getByQuery(uploadedFileRepository.createQuery());

  // Cache App lookups so a workspace full of App-attributed uploads doesn't re-query per row.
  const appOwnerCache = new Map<string, string>();

  for (const file of files) {
    if (file.billingUserId) {
      continue;
    }

    const appId = parseAppOwnerId(file.userId);
    let billingUserId: string;

    if (appId) {
      const cached = appOwnerCache.get(appId);
      if (cached) {
        billingUserId = cached;
      } else {
        const app = await appRepository.getOneByQuery(appRepository.createQuery().eq('id', appId));
        if (!app) {
          throw new Error(
            `uploaded-file ${file.id} is attributed to app-owner id "${file.userId}" but App "${appId}" was not found`
          );
        }
        billingUserId = app.createdByUserId;
        appOwnerCache.set(appId, billingUserId);
      }
    } else {
      billingUserId = file.userId;
    }

    await uploadedFileRepository.update({ ...file, billingUserId });
  }
}
