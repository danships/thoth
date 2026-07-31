import { apiRoute } from '@/lib/api/route-wrapper';
import { permanentlyDeleteManyByIds } from '@/lib/database/soft-delete-service';
import type { BatchDeletePagesBody, BatchDeletePagesResponse } from '@/types/api';
import { batchTrashBodySchema } from '@/types/api';

export const POST = apiRoute<BatchDeletePagesResponse, undefined, {}, BatchDeletePagesBody>(
  {
    expectedBodySchema: batchTrashBodySchema,
    disallowApiKey: true,
  },
  async ({ body }, session) => {
    return permanentlyDeleteManyByIds(body.ids, session.user.id);
  }
);
