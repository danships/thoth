'use client';

import { useState } from 'react';
import { useDataSource } from '@/lib/hooks/api/use-data-source';
import { useDataViewPages } from '@/lib/hooks/api/use-data-view-pages';
import { DataViewTable } from './data-view-table';
import type { DataView } from '@/types/api';

type DataViewRenderProperties = {
  view: DataView;
  onFilterSortChange?: () => void;
};

export function DataViewRender({ view, onFilterSortChange }: DataViewRenderProperties) {
  const {
    pages,
    isLoading: pagesLoading,
    error: pagesError,
    createPage,
    inProgress: createPageInProgress,
    mutate,
    hasMore,
    loadMore,
    loadingMore,
  } = useDataViewPages(view);
  const {
    data: dataSource,
    isLoading: isDataSourceLoading,
    mutate: mutateDataSource,
  } = useDataSource(view.dataSourceId);

  const [newPageName, setNewPageName] = useState('');

  const handlePageCreate = async (name: string) => {
    await createPage(name);
    setNewPageName('');
  };

  return (
    <DataViewTable
      view={view}
      dataSourceId={view.dataSourceId}
      columns={dataSource?.columns ?? []}
      pages={pages}
      isLoading={pagesLoading || isDataSourceLoading}
      error={pagesError}
      onPageCreate={handlePageCreate}
      onPageNameChange={setNewPageName}
      newPageName={newPageName}
      createPageInProgress={createPageInProgress}
      mutatePages={mutate}
      mutateDataSource={mutateDataSource}
      hasMore={hasMore}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      onFilterSortChange={onFilterSortChange}
    />
  );
}
