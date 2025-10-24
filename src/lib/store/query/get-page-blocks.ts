import { atom } from 'nanostores';
import { createFetcherStore } from '../fetcher';
import { GetPageBlocksResponse } from '@/types/api/endpoints/get-page-blocks';

export const $currentPageBlocksId = atom<string | null>(null);

export const $currentPageBlocks = createFetcherStore<GetPageBlocksResponse>([
  '/pages/',
  $currentPageBlocksId,
  '/blocks',
]);
