import { apiClient } from '@/lib/api/client';
import type { GetPagesResponse, GetPagesPagination } from '@/types/api';

export const swrFetcher = (url: string) => apiClient.get(url).then((r) => r.data.data);

// Cursor-pagination metadata for the `viewId`-driven `GET /pages` path (THOTH-037) is returned
// as a `pagination` field at the root of the JSON body, as a sibling of `data` (rather than a
// response header), so every other caller of the endpoint (favorited/recent/parentId/
// dataSourceId) keeps its existing byte-for-byte plain array response shape under `data` — only
// `useDataViewPages` reads `getPageQueryPagination(data)` off it. Stashed as a non-enumerable
// property on the returned array so `GetPagesResponse`-typed consumers (e.g. `DataViewTable`'s
// `pages` prop, `mutatePages`) don't need to change at all.
export type PageQueryPagination = GetPagesPagination;
const PAGINATION_KEY = Symbol('pageQueryPagination');

export async function swrFetcherWithPageQueryPagination(url: string): Promise<GetPagesResponse> {
  const response = await apiClient.get(url);
  const result = response.data.data as GetPagesResponse;
  const pagination = response.data.pagination as PageQueryPagination | undefined;
  if (pagination) {
    Object.defineProperty(result, PAGINATION_KEY, {
      value: pagination,
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
