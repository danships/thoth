import useSWR from 'swr';
import { GET_DATA_SOURCES_ENDPOINT, type GetDataSourcesResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export const useDataSources = () => useSWR<GetDataSourcesResponse>(GET_DATA_SOURCES_ENDPOINT, swrFetcher);
