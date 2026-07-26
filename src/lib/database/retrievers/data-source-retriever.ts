import { DataSourceContainer } from '@/types/database';
import { getContainerRepository } from '..';
import { addUserIdToQuery } from '../helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';

class DataSourceRetriever {
  public async retrieveDataSource(id: string, userId: string): Promise<DataSourceContainer> {
    const containerRepository = await getContainerRepository();

    const existingDataSource = await containerRepository.getOneByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('id', id), userId).eq('type', 'data-source')
    );

    if (!existingDataSource || existingDataSource.type !== 'data-source') {
      throw new NotFoundError('Data source not found', true);
    }

    await assertWorkspaceAccess(userId, existingDataSource.workspaceId);

    return existingDataSource;
  }
}

export const dataSourceRetriever = new DataSourceRetriever();
