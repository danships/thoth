import useSWR from 'swr';
import type { GetDataSourcesResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export const useDataSources = () => useSWR<GetDataSourcesResponse>('/data-sources', swrFetcher);
