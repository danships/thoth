import { useCallback } from 'react';
import { usePagesByDataSource } from './use-pages';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { CREATE_PAGE_ENDPOINT, type CreatePageBody, type CreatePageResponse } from '@/types/api';

export function useDataViewPages(dataSourceId: string) {
  const { data: pages, isLoading, error, mutate } = usePagesByDataSource(dataSourceId, { includeValues: true });
  const { post, inProgress } = useCudApi();

  const createPage = useCallback(
    async (name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName || inProgress) {
        return;
      }
      await post<CreatePageResponse, CreatePageBody>(CREATE_PAGE_ENDPOINT, {
        name: trimmedName,
        emoji: null,
        parentId: dataSourceId,
      });
      mutate();
    },
    [dataSourceId, inProgress, post, mutate]
  );

  return {
    pages,
    isLoading,
    error,
    createPage,
    inProgress,
    mutate,
  };
}
