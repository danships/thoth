import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import type { GetPageBreadcrumbsParameters, GetPageBreadcrumbsResponse, Page } from '@/types/api';
import { getPageBreadcrumbsParametersSchema } from '@/types/api';

export const GET = apiRoute<GetPageBreadcrumbsResponse, {}, GetPageBreadcrumbsParameters>(
  {
    expectedParamsSchema: getPageBreadcrumbsParametersSchema,
  },
  async ({ params }, session): Promise<GetPageBreadcrumbsResponse> => {
    const containerRepository = await getContainerRepository();
    const breadcrumbs: Page[] = [];
    const visitedIds = new Set<string>();

    // Start with the current page
    let currentPage = await pageRetriever.retrievePage(params.id, session.user.id);

    // Traverse up the parent chain
    while (currentPage) {
      // Prevent circular references
      if (visitedIds.has(currentPage.id)) {
        break;
      }
      visitedIds.add(currentPage.id);

      // Add current page to breadcrumb (will be reversed at the end)
      breadcrumbs.push({
        id: currentPage.id,
        name: currentPage.name,
        emoji: currentPage.emoji || null,
        parentId: currentPage.parentId || null,
        createdAt: currentPage.createdAt,
        lastUpdated: currentPage.lastUpdated,
      });

      // If no parent, we've reached the root
      if (!currentPage.parentId) {
        break;
      }

      // Fetch the parent page
      const parentPage = await containerRepository.getOneByQuery(
        addUserIdToQuery(containerRepository.createQuery().eq('id', currentPage.parentId), session.user.id).eq(
          'type',
          'page'
        )
      );

      if (!parentPage || parentPage.type !== 'page') {
        break;
      }

      currentPage = parentPage;
    }

    // Reverse to get root -> current order
    return breadcrumbs.toReversed();
  }
);
