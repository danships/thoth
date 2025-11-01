import useSWR from 'swr';
import { GET_DATA_SOURCE_ENDPOINT, type GetDataSourceResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export const useDataSource = (id: string | null) =>
  useSWR<GetDataSourceResponse>(id ? GET_DATA_SOURCE_ENDPOINT.replace(':id', id) : null, swrFetcher);
