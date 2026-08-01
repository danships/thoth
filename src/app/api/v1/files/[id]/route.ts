import { apiRoute } from '@/lib/api/route-wrapper';
import { getFileUsageRepository, getUploadedFileRepository } from '@/lib/database';
import { getStorageAdapter } from '@/lib/storage';
import { assertFileAccess } from '@/lib/files/access';
import { ForbiddenError } from '@/lib/errors/forbidden-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import {
  deleteFileParametersSchema,
  getFileParametersSchema,
  type DeleteFileParameters,
  type DeleteFileResponse,
  type GetFileParameters,
  type GetFileResponse,
} from '@/types/api';

export const GET = apiRoute<GetFileResponse, undefined, GetFileParameters>(
  {
    expectedParamsSchema: getFileParametersSchema,
  },
  async ({ params }, session) => {
    const uploadedFileRepository = await getUploadedFileRepository();
    const file = await uploadedFileRepository.getOneByQuery(uploadedFileRepository.createQuery().eq('id', params.id));

    if (!file) {
      throw new NotFoundError('File not found');
    }

    await assertFileAccess(session, file);

    return {
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      url: `/api/v1/files/${file.id}/content`,
      createdAt: file.createdAt,
      lastUpdated: file.lastUpdated,
    };
  }
);

export const DELETE = apiRoute<DeleteFileResponse, undefined, DeleteFileParameters>(
  {
    expectedParamsSchema: deleteFileParametersSchema,
  },
  async ({ params }, session) => {
    const uploadedFileRepository = await getUploadedFileRepository();
    const file = await uploadedFileRepository.getOneByQuery(uploadedFileRepository.createQuery().eq('id', params.id));

    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Owner-only: unlike read access (which extends through `file-usage`), deletion is never
    // available to a page-access-only caller — only whoever originally uploaded the file.
    if (file.userId !== session.user.id) {
      throw new ForbiddenError('Only the uploader can delete this file');
    }

    const storageAdapter = await getStorageAdapter();
    await storageAdapter.delete(file.storageKey);

    const fileUsageRepository = await getFileUsageRepository();
    const usageRows = await fileUsageRepository.getByQuery(fileUsageRepository.createQuery().eq('fileId', file.id));
    for (const usageRow of usageRows) {
      await fileUsageRepository.deleteUsingId(usageRow.id);
    }

    await uploadedFileRepository.deleteUsingId(file.id);

    return { id: file.id };
  }
);
