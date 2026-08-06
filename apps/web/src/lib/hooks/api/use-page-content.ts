import useSWR from 'swr';
import { GET_PAGE_CONTENT_ENDPOINT, type GetPageContentResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export const usePageContent = (pageId: string | null) =>
  useSWR<GetPageContentResponse>(pageId ? GET_PAGE_CONTENT_ENDPOINT.replace(':id', pageId) : null, swrFetcher);
