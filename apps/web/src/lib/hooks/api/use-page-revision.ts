import useSWR from 'swr';
import { GET_PAGE_REVISION_ENDPOINT, type GetPageRevisionResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

// `null` for either id keeps the SWR key `null` (no fetch) — used while no revision is
// currently selected in the history drawer.
export const usePageRevision = (pageId: string | null, revisionId: string | null) =>
  useSWR<GetPageRevisionResponse>(
    pageId && revisionId ? GET_PAGE_REVISION_ENDPOINT.replace(':id', pageId).replace(':revisionId', revisionId) : null,
    swrFetcher
  );
