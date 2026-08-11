import type { Column } from '@/types/schemas/entities/container';
import type { DataSourceContainer, PageContainer } from '@thoth/database/types';
import { getDataViewRepository } from '..';
import { addWorkspaceIdToQuery } from '../helpers';
import { dataSourceRetriever } from './data-source-retriever';
import { NotFoundError } from '@/lib/errors/not-found-error';

class PageColumnRetriever {
  public async retrieveEditableColumns(page: PageContainer, userId: string): Promise<Column[]> {
    if (!page.parentId) {
      return [];
    }

    let dataSource: DataSourceContainer;
    try {
      dataSource = await dataSourceRetriever.retrieveDataSource(page.parentId, userId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        // The parent is a plain Page, not a DataSource, so there are no editable columns.
        return [];
      }
      throw error;
    }

    const columnById = new Map(dataSource.columns.map((column) => [column.id, column] as const));

    const dataViewRepository = await getDataViewRepository();
    // Content is scoped by workspace membership + grant, not creator identity (THOTH-042).
    // The data source is already authorised above; its own workspaceId is a safe, defensive
    // same-workspace constraint (Pattern C — no second membership assertion needed here).
    const dataViews = await dataViewRepository.getByQuery(
      addWorkspaceIdToQuery(dataViewRepository.createQuery(), dataSource.workspaceId)
        .eq('dataSourceId', dataSource.id)
        .sort('createdAt', 'asc') // oldest view first = most stable/predictable merge order
    );

    // Merge columns across all views, preserving first-seen order (a view's own column
    // array order is authoritative; subsequent views only append columns not yet seen).
    const orderedIds: string[] = [];
    const seen = new Set<string>();
    for (const view of dataViews) {
      for (const columnId of view.columns) {
        if (!seen.has(columnId)) {
          seen.add(columnId);
          orderedIds.push(columnId);
        }
      }
    }

    if (orderedIds.length === 0) {
      // No DataView exists yet, or every DataView on this data source currently defines zero
      // columns — in both cases, fall back to showing every column on the data source, in the
      // data source's own stored (array) order, so a row is never uneditable.
      return dataSource.columns;
    }

    return orderedIds.map((id) => columnById.get(id)).filter((column): column is Column => column !== undefined); // drop stale/deleted column ids defensively
  }
}

export const pageColumnRetriever = new PageColumnRetriever();
