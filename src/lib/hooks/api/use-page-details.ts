import useSWR from 'swr';
import { GET_PAGE_DETAILS_ENDPOINT, type GetPageDetailsResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export const usePageDetails = (pageId: string | null) =>
  useSWR<GetPageDetailsResponse>(
    pageId ? `${GET_PAGE_DETAILS_ENDPOINT.replace(':id', pageId)}?includeBlocks=true` : null,
    swrFetcher
  );
