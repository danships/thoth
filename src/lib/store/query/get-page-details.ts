import { atom } from 'nanostores';
import type { GetPageDetailsResponse } from '@/types/api';
import { createFetcherStore } from '../fetcher';

export const $currentPageId = atom<string | null>(null);

export const $currentPage = createFetcherStore<GetPageDetailsResponse>(['/pages/', $currentPageId]);
