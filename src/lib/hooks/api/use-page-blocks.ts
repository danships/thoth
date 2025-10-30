import useSWR from 'swr';
import type { GetPageBlocksResponse } from '@/types/api/endpoints/get-page-blocks';
import { swrFetcher } from '@/lib/swr/fetcher';

export const usePageBlocks = (pageId: string | null) =>
  useSWR<GetPageBlocksResponse>(pageId ? `/pages/${pageId}/blocks` : null, swrFetcher);
