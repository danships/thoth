import { getAppRepository } from '..';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import type { App } from '@thoth/database/types';

class AppRetriever {
  /**
   * Fetches an `App` by id and authorizes it by verifying the caller is a member of the App's
   * own `workspaceId` (never trusted from the client) — mirroring the `page-retriever.ts` /
   * `data-source-retriever.ts` pattern. Always throws `NotFoundError` (never 403) so a caller
   * can't distinguish "doesn't exist" from "exists but you're not a member of that workspace".
   */
  public async retrieveApp(id: string, userId: string): Promise<App> {
    const appRepository = await getAppRepository();
    const app = await appRepository.getOneByQuery(appRepository.createQuery().eq('id', id));

    if (!app) {
      throw new NotFoundError('App not found');
    }

    await assertWorkspaceAccess(userId, app.workspaceId);

    return app;
  }
}

export const appRetriever = new AppRetriever();
