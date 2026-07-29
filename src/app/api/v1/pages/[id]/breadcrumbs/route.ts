import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getDataViewRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import type { Container, PageContainer } from '@/types/database';
import type { GetPageBreadcrumbsParameters, GetPageBreadcrumbsResponse, Page } from '@/types/api';
import { getPageBreadcrumbsParametersSchema } from '@/types/api';

/**
 * Records added to a data source live under a `data-source` container (`parentId` points at
 * the data source, not a page), so a data source has no `page` ancestor via `parentId` alone.
 * The only link back to the page(s) that host it is indirect: a `DataView` references the data
 * source via `dataSourceId`, and a hosting page lists that view's id in its own `views` array.
 * This looks up a page that hosts the given data source so breadcrumb traversal can continue
 * past the data source and up to that page (and its own ancestors).
 */
async function findHostPageForDataSource(dataSourceId: string, userId: string): Promise<PageContainer | null> {
  const dataViewRepository = await getDataViewRepository();
  const dataViews = await dataViewRepository.getByQuery(
    addUserIdToQuery(dataViewRepository.createQuery().eq('dataSourceId', dataSourceId), userId)
  );

  if (dataViews.length === 0) {
    return null;
  }

  const dataViewIds = new Set(dataViews.map((dataView) => dataView.id));

  const containerRepository = await getContainerRepository();
  const pages = await containerRepository.getByQuery(
    addUserIdToQuery(containerRepository.createQuery().eq('type', 'page'), userId)
  );

  const hostPage = pages.find(
    (candidate): candidate is PageContainer =>
      candidate.type === 'page' && (candidate.views ?? []).some((viewId) => dataViewIds.has(viewId))
  );

  return hostPage ?? null;
}

export const GET = apiRoute<GetPageBreadcrumbsResponse, {}, GetPageBreadcrumbsParameters>(
  {
    expectedParamsSchema: getPageBreadcrumbsParametersSchema,
  },
  async ({ params }, session): Promise<GetPageBreadcrumbsResponse> => {
    const breadcrumbs: Page[] = [];
    const visitedIds = new Set<string>();

    // Start with the current page
    const startingPage = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, startingPage);

    // Traverse up the ancestor chain. Only `page` containers are added to the visible
    // breadcrumb trail; `data-source` containers are skipped over transparently so
    // traversal continues up to the page (or root page) above them.
    let currentContainer: Container | null = startingPage;

    while (currentContainer) {
      // Prevent circular references
      if (visitedIds.has(currentContainer.id)) {
        break;
      }
      visitedIds.add(currentContainer.id);

      if (currentContainer.type === 'page') {
        // Add current page to breadcrumb (will be reversed at the end)
        breadcrumbs.push({
          id: currentContainer.id,
          name: currentContainer.name,
          emoji: currentContainer.emoji || null,
          parentId: currentContainer.parentId || null,
          createdAt: currentContainer.createdAt,
          lastUpdated: currentContainer.lastUpdated,
        });

        // Pages nest directly via parentId.
        if (!currentContainer.parentId) {
          break;
        }

        const containerRepository = await getContainerRepository();
        const parentContainer = await containerRepository.getOneByQuery(
          addUserIdToQuery(containerRepository.createQuery().eq('id', currentContainer.parentId), session.user.id)
        );

        currentContainer = parentContainer ?? null;
      } else {
        // Data sources have no `page` ancestor via parentId — look up the page hosting it
        // via its views instead.
        currentContainer = await findHostPageForDataSource(currentContainer.id, session.user.id);
      }
    }

    // Reverse to get root -> current order
    return breadcrumbs.toReversed();
  }
);
