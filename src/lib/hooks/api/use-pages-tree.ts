import useSWR from 'swr';
import { GET_PAGES_TREE_ENDPOINT, type GetPagesTreeResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export const usePagesTree = () => useSWR<GetPagesTreeResponse>(GET_PAGES_TREE_ENDPOINT, swrFetcher);
