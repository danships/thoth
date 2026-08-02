import { DataView } from '@/types/database';
import { getDataViewRepository } from '..';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';

class DataViewRetriever {
  private async retrieveDataViewInternal(id: string, userId: string): Promise<DataView> {
    const dataViewRepository = await getDataViewRepository();

    // Content is scoped by workspace membership + grant, not creator identity (THOTH-042).
    const existingDataView = await dataViewRepository.getOneByQuery(dataViewRepository.createQuery().eq('id', id));

    if (!existingDataView) {
      throw new NotFoundError('Data view not found', true);
    }

    await assertWorkspaceAccess(userId, existingDataView.workspaceId);

    return existingDataView;
  }

  public async retrieveDataView(id: string, userId: string): Promise<DataView> {
    const dataView = await this.retrieveDataViewInternal(id, userId);
    if (dataView.deletedAt) {
      throw new NotFoundError('Data view not found', true);
    }
    return dataView;
  }

  public async retrieveDataViewIncludingDeleted(id: string, userId: string): Promise<DataView> {
    return this.retrieveDataViewInternal(id, userId);
  }
}

export const dataViewRetriever = new DataViewRetriever();
