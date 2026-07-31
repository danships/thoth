import { PageContainer } from '@/types/database';
import { getContainerRepository } from '..';
import { addUserIdToQuery } from '../helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';

class PageRetriever {
  private async retrievePageInternal(id: string, userId: string): Promise<PageContainer> {
    const containerRepository = await getContainerRepository();

    const existingPage = await containerRepository.getOneByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('id', id), userId).eq('type', 'page')
    );

    if (!existingPage || existingPage.type !== 'page') {
      throw new NotFoundError('Page not found', true);
    }

    // Anchor authorization to the entity's own `workspaceId`, verified against real
    // membership — never trusted from the client. See `assertWorkspaceAccess` for why this is
    // a discrete step rather than inlined into the query above.
    await assertWorkspaceAccess(userId, existingPage.workspaceId);

    return existingPage;
  }

  public async retrievePage(id: string, userId: string): Promise<PageContainer> {
    const page = await this.retrievePageInternal(id, userId);
    if (page.deletedAt) {
      throw new NotFoundError('Page not found', true);
    }
    return page;
  }

  public async retrievePageIncludingDeleted(id: string, userId: string): Promise<PageContainer> {
    return this.retrievePageInternal(id, userId);
  }
}

export const pageRetriever = new PageRetriever();
