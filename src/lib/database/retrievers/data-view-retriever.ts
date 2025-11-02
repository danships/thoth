import { DataView } from '@/types/database';
import { getDataViewRepository } from '..';
import { addUserIdToQuery } from '../helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';

class DataViewRetriever {
  public async retrieveDataView(id: string, userId: string): Promise<DataView> {
    const dataViewRepository = await getDataViewRepository();

    const existingDataView = await dataViewRepository.getOneByQuery(
      addUserIdToQuery(dataViewRepository.createQuery().eq('id', id), userId)
    );

    if (!existingDataView) {
      throw new NotFoundError('Data view not found', true);
    }

    return existingDataView;
  }
}

export const dataViewRetriever = new DataViewRetriever();
