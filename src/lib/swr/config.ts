import { SWRConfiguration } from 'swr';
import { swrFetcher } from './fetcher';

export const swrConfig: SWRConfiguration = {
  fetcher: swrFetcher,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 2000,
};
