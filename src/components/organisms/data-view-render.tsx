'use client';

import { useMemo, useState } from 'react';
import { useDataSource } from '@/lib/hooks/api/use-data-source';
import { useDataViewPages } from '@/lib/hooks/api/use-data-view-pages';
import { resolveDataViewColumnLayout } from '@/lib/data-view/column-layout';
import { DataViewTable } from './data-view-table';
import type { DataView } from '@/types/api';

type DataViewRenderProperties = {
  view: DataView;
  onViewChange?: () => void;
};

export function DataViewRender({ view, onViewChange }: DataViewRenderProperties) {
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

  // Resolved against the Data Source's *current* columns on every render (THOTH-052), so a
  // column rename/type change or a newly-added/deleted column is reflected immediately without
  // its own layout write. `dataSource?.columns` is passed to `DataViewTable` separately (for
  // `FilterSortBar`, whose filter/sort targets include hidden columns).
  const layout = useMemo(
    () => resolveDataViewColumnLayout(dataSource?.columns ?? [], view.columns ?? [], view.columnLayout ?? null),
    [dataSource, view.columns, view.columnLayout]
  );

  return (
    <DataViewTable
      view={view}
      dataSourceId={view.dataSourceId}
      dataSourceColumns={dataSource?.columns ?? []}
      layout={layout}
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
      onViewChange={onViewChange}
    />
  );
}
