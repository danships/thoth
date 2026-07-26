import { apiRoute } from '@/lib/api/route-wrapper';
import { isWorkspaceSlugAvailable } from '@/lib/database/workspace-slug';
import type { GetWorkspaceSlugAvailabilityQuery, GetWorkspaceSlugAvailabilityResponse } from '@/types/api';
import { getWorkspaceSlugAvailabilityQuerySchema } from '@/types/api';

export const GET = apiRoute<GetWorkspaceSlugAvailabilityResponse, GetWorkspaceSlugAvailabilityQuery, {}, {}>(
  {
    expectedQuerySchema: getWorkspaceSlugAvailabilityQuerySchema,
  },
  async ({ query }) => {
    const available = await isWorkspaceSlugAvailable(query.slug, query.excludeWorkspaceId);
    return { available };
  }
);
