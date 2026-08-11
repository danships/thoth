import { PageContainer } from '@thoth/database/types';
import { getContainerRepository } from '..';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';

class PageRetriever {
  private async retrievePageInternal(id: string, userId: string): Promise<PageContainer> {
    const containerRepository = await getContainerRepository();

    // Content is scoped by workspace membership + grant, not creator identity (THOTH-042).
    const existingPage = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', id).eq('type', 'page')
    );

    if (!existingPage || existingPage.type !== 'page') {
      throw new NotFoundError('Page not found', true);
    }

    // Safety invariant: membership is asserted on the row's OWN workspaceId (never trusted
    // from the client), so a row from another workspace can never be returned even without a
    // creator (`userId`) gate. See `assertWorkspaceAccess` for why this is a discrete step
    // rather than inlined into the query above.
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
