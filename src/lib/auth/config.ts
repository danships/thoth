import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import { createPool } from 'mysql2/promise';
import type { ContainerCreate, WorkspaceCreate } from '@/types/database';
import { getContainerRepository, getDatabase, getWorkspaceRepository } from '../database';
import { getEnvironment } from '../environment';

await getDatabase();

export const auth = betterAuth({
  database: createPool(getEnvironment().DB),
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: 'oidc',
          clientId: getEnvironment().OIDC_CLIENT_ID,
          clientSecret: getEnvironment().OIDC_CLIENT_SECRET,
          authorizationUrl: getEnvironment().OIDC_AUTHORIZATION_URL,
          discoveryUrl: getEnvironment().OIDC_DISCOVERY_URL,
          scopes: ['openid', 'profile', 'email'],
        },
      ],
    }),
  ],
  trustedOrigins: getEnvironment().NODE_ENV === 'development' ? ['http://localhost:3000'] : [],
  secret: getEnvironment().BETTER_AUTH_SECRET,
  hooks: {},
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const workspaceRepository = await getWorkspaceRepository();
          const workspace = await workspaceRepository.create({
            name: 'Default Workspace',
            userId: user.id,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          } satisfies WorkspaceCreate);

          const containerRepository = await getContainerRepository();
          await containerRepository.create({
            name: 'Welcome',
            type: 'page',
            userId: user.id,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            workspaceId: workspace.id,
            emoji: '👋',
            parentId: null,
          } satisfies ContainerCreate);
        },
      },
    },
  },
});
