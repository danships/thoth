import useSWR from 'swr';
import { GET_PAGE_BLOCKS_ENDPOINT, type GetPageBlocksResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export const usePageBlocks = (pageId: string | null) =>
  useSWR<GetPageBlocksResponse>(pageId ? GET_PAGE_BLOCKS_ENDPOINT.replace(':id', pageId) : null, swrFetcher);
