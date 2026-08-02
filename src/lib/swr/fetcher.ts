import { apiClient } from '@/lib/api/client';
import type { GetPagesResponse } from '@/types/api';

export const swrFetcher = (url: string) => apiClient.get(url).then((r) => r.data.data);

// Cursor-pagination metadata for the `viewId`-driven `GET /pages` path (THOTH-037) is carried in
// a response header (`X-Page-Query-Pagination`) rather than the JSON body, so every other caller
// of the endpoint (favorited/recent/parentId/dataSourceId) keeps its existing byte-for-byte plain
// array response shape. Stashed here as a non-enumerable property on the returned array so
// `GetPagesResponse`-typed consumers (e.g. `DataViewTable`'s `pages` prop, `mutatePages`) don't
// need to change at all — only `useDataViewPages` reads `getPageQueryPagination(data)` off it.
export type PageQueryPagination = { nextCursor: string | null; hasMore: boolean };
const PAGINATION_KEY = Symbol('pageQueryPagination');

export async function swrFetcherWithPageQueryPagination(url: string): Promise<GetPagesResponse> {
  const response = await apiClient.get(url);
  const result = response.data.data as GetPagesResponse;
  const header = response.headers['x-page-query-pagination'] as string | undefined;
  if (header) {
    Object.defineProperty(result, PAGINATION_KEY, {
      value: JSON.parse(header) as PageQueryPagination,
      enumerable: false,
    });
  }
  return result;
}

export function getPageQueryPagination(pages: GetPagesResponse | undefined): PageQueryPagination | undefined {
  if (!pages) {
    return undefined;
  }
  return (pages as unknown as Record<symbol, PageQueryPagination>)[PAGINATION_KEY];
}
