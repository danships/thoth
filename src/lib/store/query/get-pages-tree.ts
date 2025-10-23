import { createFetcherStore } from '../fetcher';
import { GET_PAGES_TREE_ENDPOINT, type GetPagesTreeResponse } from '@/types/api';

export const $rootPagesTree = createFetcherStore<GetPagesTreeResponse>([GET_PAGES_TREE_ENDPOINT]);
