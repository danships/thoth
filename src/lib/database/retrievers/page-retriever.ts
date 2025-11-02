import { PageContainer } from '@/types/database';
import { getContainerRepository } from '..';
import { addUserIdToQuery } from '../helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';

class PageRetriever {
  public async retrievePage(id: string, userId: string): Promise<PageContainer> {
    const containerRepository = await getContainerRepository();

    const existingPage = await containerRepository.getOneByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('id', id), userId).eq('type', 'page')
    );

    if (!existingPage || existingPage.type !== 'page') {
      throw new NotFoundError('Page not found', true);
    }

    return existingPage;
  }
}

export const pageRetriever = new PageRetriever();
