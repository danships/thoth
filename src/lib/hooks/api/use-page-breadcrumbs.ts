import useSWR from 'swr';
import { GET_PAGE_BREADCRUMBS_ENDPOINT, type GetPageBreadcrumbsResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export const usePageBreadcrumbs = (pageId: string | null) =>
  useSWR<GetPageBreadcrumbsResponse>(pageId ? GET_PAGE_BREADCRUMBS_ENDPOINT.replace(':id', pageId) : null, swrFetcher);
