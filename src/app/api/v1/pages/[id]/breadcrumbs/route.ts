import { apiRoute } from '@/lib/api/route-wrapper';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { GetPageBreadcrumbsParameters, GetPageBreadcrumbsResponse, Page } from '@/types/api';
import { getPageBreadcrumbsParametersSchema } from '@/types/api';

export const GET = apiRoute<GetPageBreadcrumbsResponse, {}, GetPageBreadcrumbsParameters>(
  {
    expectedParamsSchema: getPageBreadcrumbsParametersSchema,
  },
  async ({ params }, session): Promise<GetPageBreadcrumbsResponse> => {
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

      // Fetch the parent page using the centralized retriever
      try {
        currentPage = await pageRetriever.retrievePage(currentPage.parentId, session.user.id);
      } catch (error) {
        // If parent page not found, we've reached as far as we can go
        if (error instanceof NotFoundError) {
          break;
        }
        throw error;
      }
    }

    // Reverse to get root -> current order
    return breadcrumbs.toReversed();
  }
);
