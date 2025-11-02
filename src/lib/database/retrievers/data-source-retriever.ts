import { DataSourceContainer } from '@/types/database';
import { getContainerRepository } from '..';
import { addUserIdToQuery } from '../helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';

class DataSourceRetriever {
  public async retrieveDataSource(id: string, userId: string): Promise<DataSourceContainer> {
    const containerRepository = await getContainerRepository();

    const existingDataSource = await containerRepository.getOneByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('id', id), userId).eq('type', 'data-source')
    );

    if (!existingDataSource || existingDataSource.type !== 'data-source') {
      throw new NotFoundError('Data source not found', true);
    }

    return existingDataSource;
  }
}

export const dataSourceRetriever = new DataSourceRetriever();
