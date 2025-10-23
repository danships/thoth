import type { Query } from 'supersave';

export const addUserIdToQuery = (query: Query, userId: string) => {
  return query.eq('userId', userId);
};

export const addWorkspaceIdToQuery = (query: Query, workspaceId: string) => {
  return query.eq('workspaceId', workspaceId);
};
