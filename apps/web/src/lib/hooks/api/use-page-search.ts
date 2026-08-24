'use client';

import axios from 'axios';
import { useDebouncedValue } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import type { GetSearchResultsResponse } from '@/types/api';

type SearchResult = GetSearchResultsResponse['results'];

function isAbortError(error: unknown): boolean {
  return (
    axios.isCancel(error) || (error instanceof Error && (error.name === 'AbortError' || error.name === 'CanceledError'))
  );
}

export function usePageSearch(
  workspaceId: string,
  rawQuery: string
): {
  results: SearchResult;
  isLoading: boolean;
  error: unknown | null;
} {
  const trimmedQuery = rawQuery.trim();
  const [debouncedQuery] = useDebouncedValue(trimmedQuery, 300);
  const [results, setResults] = useState<SearchResult>([]);
  const [error, setError] = useState<unknown | null>(null);
  const [previousRawQuery, setPreviousRawQuery] = useState(rawQuery);
  const requestKey = workspaceId && debouncedQuery.length > 0 ? `${workspaceId}:${debouncedQuery}` : null;
  const [previousRequestKey, setPreviousRequestKey] = useState<string | null>(requestKey);
  const [inFlightRequestKey, setInFlightRequestKey] = useState<string | null>(null);

  if (rawQuery !== previousRawQuery) {
    setPreviousRawQuery(rawQuery);
    if (results.length > 0) {
      setResults([]);
    }
    if (error !== null) {
      setError(null);
    }
    if (rawQuery.trim().length === 0 && inFlightRequestKey !== null) {
      setInFlightRequestKey(null);
    }
  }

  if (requestKey !== previousRequestKey) {
    setPreviousRequestKey(requestKey);
    setInFlightRequestKey(requestKey);
  }

  useEffect(() => {
    if (requestKey === null) {
      return;
    }

    const controller = new AbortController();

    void api.search
      .pages({ workspaceId, query: debouncedQuery, type: 'page', limit: 10 }, { signal: controller.signal })
      .then((response) => {
        setResults(response.data.data.results as SearchResult);
        setInFlightRequestKey((current) => (current === requestKey ? null : current));
      })
      .catch((nextError: unknown) => {
        if (isAbortError(nextError)) {
          return;
        }
        setError(nextError);
        setResults([]);
        setInFlightRequestKey((current) => (current === requestKey ? null : current));
      });

    return () => {
      controller.abort();
    };
  }, [debouncedQuery, requestKey, workspaceId]);

  return { results, isLoading: inFlightRequestKey !== null, error };
}
