import { apiRoute } from '@/lib/api/route-wrapper';
import { restoreManyByIds } from '@/lib/database/soft-delete-service';
import type { BatchRestorePagesResponse, BatchTrashBody } from '@/types/api';
import { batchTrashBodySchema } from '@/types/api';

export const POST = apiRoute<BatchRestorePagesResponse, undefined, {}, BatchTrashBody>(
  {
    expectedBodySchema: batchTrashBodySchema,
    disallowApiKey: true,
  },
  async ({ body }, session) => {
    return restoreManyByIds(body.ids, session.user.id);
  }
);
