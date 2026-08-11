import { DataSourceContainer } from '@thoth/database/types';
import { getContainerRepository } from '..';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';

class DataSourceRetriever {
  private async retrieveDataSourceInternal(id: string, userId: string): Promise<DataSourceContainer> {
    const containerRepository = await getContainerRepository();

    // Content is scoped by workspace membership + grant, not creator identity (THOTH-042).
    const existingDataSource = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', id).eq('type', 'data-source')
    );

    if (!existingDataSource || existingDataSource.type !== 'data-source') {
      throw new NotFoundError('Data source not found', true);
    }

    await assertWorkspaceAccess(userId, existingDataSource.workspaceId);

    return existingDataSource;
  }

  public async retrieveDataSource(id: string, userId: string): Promise<DataSourceContainer> {
    const dataSource = await this.retrieveDataSourceInternal(id, userId);
    if (dataSource.deletedAt) {
      throw new NotFoundError('Data source not found', true);
    }
    return dataSource;
  }

  public async retrieveDataSourceIncludingDeleted(id: string, userId: string): Promise<DataSourceContainer> {
    return this.retrieveDataSourceInternal(id, userId);
  }
}

export const dataSourceRetriever = new DataSourceRetriever();
