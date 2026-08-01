import type { NextRequest } from 'next/server';
import { NextResponse, connection } from 'next/server';
import { getSessionOrApiKey } from '@/lib/auth/session';
import { assertGrantAllowsWrite, assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { resolveDefaultWorkspaceId } from '@/lib/database/resolve-workspace';
import { getFileUsageRepository, getUploadedFileRepository } from '@/lib/database';
import { getStorageAdapter } from '@/lib/storage';
import { getFileExtension, isDangerousFile } from '@/lib/files/constants';
import { assertWithinQuota } from '@/lib/files/quota';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { PayloadTooLargeError } from '@/lib/errors/payload-too-large-error';
import { UnsupportedMediaTypeError } from '@/lib/errors/unsupported-media-type-error';
import { toErrorResponse } from '@/lib/api/manual-route-error';
import { getEnvironment } from '@/lib/environment';
import type { UploadFileResponse } from '@/types/api';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * `POST /api/v1/files` — upload handler. Cannot use `apiRoute` (JSON-only) because the request
 * body is `multipart/form-data` — a plain `NextRequest`/`NextResponse` handler that
 * authenticates via `getSessionOrApiKey` and replicates `apiRoute`'s `HttpError` → status
 * mapping (`toErrorResponse`) instead.
 *
 * Form fields:
 * - `file` (required): the `File` blob to upload.
 * - `pageId` (optional): when present, the page this upload is destined for — authorised via
 *   `assertGrantAllowsContainerForSession` and used to both resolve the owning workspace and
 *   create an initial `file-usage` row so the file is immediately retrievable through that page.
 * - `workspaceId` (optional, ignored when `pageId` is present): explicit workspace to scope the
 *   upload to when there's no page yet (e.g. uploading before the page's content is saved).
 */
export async function POST(request: NextRequest) {
  await connection();
  try {
    const session = await getSessionOrApiKey(request);

    if (session.appContext && MUTATING_METHODS.has(request.method)) {
      assertGrantAllowsWrite(session.appContext.accessGrant);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const pageId = formData.get('pageId');

    if (!(file instanceof File) || file.size === 0) {
      throw new BadRequestError('A non-empty file is required');
    }

    const environment = await getEnvironment();
    if (file.size > environment.MAX_UPLOAD_SIZE_BYTES) {
      throw new PayloadTooLargeError(
        `File exceeds the maximum upload size of ${environment.MAX_UPLOAD_SIZE_BYTES} bytes`
      );
    }

    const filename = file.name || 'upload';
    if (isDangerousFile({ filename, mimeType: file.type })) {
      throw new UnsupportedMediaTypeError('This file type is not allowed');
    }

    let workspaceId: string;
    let pageIdString: string | undefined;

    if (typeof pageId === 'string' && pageId.length > 0) {
      const page = await pageRetriever.retrievePage(pageId, session.user.id);
      await assertGrantAllowsContainerForSession(session, page);
      workspaceId = page.workspaceId;
      pageIdString = pageId;
    } else {
      const workspaceIdField = formData.get('workspaceId');
      workspaceId =
        typeof workspaceIdField === 'string' && workspaceIdField.length > 0
          ? workspaceIdField
          : await resolveDefaultWorkspaceId(session.user.id);
      await assertWorkspaceAccess(session.user.id, workspaceId);
    }

    await assertWithinQuota(workspaceId, file.size);

    const buffer = Buffer.from(await file.arrayBuffer());
    const storageAdapter = await getStorageAdapter();
    const uploadedFileRepository = await getUploadedFileRepository();

    const now = new Date().toISOString();
    const created = await uploadedFileRepository.create({
      filename,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      extension: getFileExtension(filename),
      // Placeholder, replaced immediately below once the entity's generated `id` is known —
      // SuperSave assigns `id` on `.create()`, so the storage key can only be derived afterwards.
      storageKey: 'pending',
      storageType: storageAdapter.type,
      workspaceId,
      userId: session.user.id,
      createdAt: now,
      lastUpdated: now,
    });

    const storageKey = `${workspaceId}/${created.id}`;
    await storageAdapter.save(storageKey, buffer);

    const updated = await uploadedFileRepository.update({
      ...created,
      storageKey,
    });

    if (pageIdString) {
      const fileUsageRepository = await getFileUsageRepository();
      const existing = await fileUsageRepository.getOneByQuery(
        fileUsageRepository.createQuery().eq('fileId', updated.id).eq('containerId', pageIdString)
      );
      if (!existing) {
        await fileUsageRepository.create({
          fileId: updated.id,
          containerId: pageIdString,
          workspaceId,
          userId: session.user.id,
          createdAt: now,
        });
      }
    }

    const response: UploadFileResponse = {
      id: updated.id,
      filename: updated.filename,
      mimeType: updated.mimeType,
      size: updated.size,
      url: `/api/v1/files/${updated.id}/content`,
      createdAt: updated.createdAt,
    };

    return NextResponse.json({ data: response });
  } catch (error) {
    return toErrorResponse(error);
  }
}
