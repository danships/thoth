import useSWR from 'swr';
import type { GetPageDetailsResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export const usePageDetails = (pageId: string | null) =>
  useSWR<GetPageDetailsResponse>(pageId ? `/pages/${pageId}?includeBlocks=true` : null, swrFetcher);
