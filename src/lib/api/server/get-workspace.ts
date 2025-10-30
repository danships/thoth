import { getWorkspaceRepository } from '@/lib/database';
import { NotFoundError } from '@/lib/errors/not-found-error';

export async function getWorkspace(userId: string) {
  const workspaceRepository = await getWorkspaceRepository();
  const workspace = await workspaceRepository.getById(userId);

  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  return workspace;
}
