import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import { createPool } from 'mysql2/promise';
import type { PageContainerCreate, WorkspaceCreate } from '@/types/database';
import { getContainerRepository, getDatabase, getWorkspaceRepository } from '../database';
import { getEnvironment } from '../environment';
import { connection } from 'next/server';

let authInstance: ReturnType<typeof betterAuth> | null = null;

async function initializeAuth() {
  if (authInstance === null) {
    await connection().then(getDatabase);

    const environment = await getEnvironment();

    authInstance = betterAuth({
      database: createPool(environment.DB),
      plugins: [
        genericOAuth({
          config: [
            {
              providerId: 'oidc',
              clientId: environment.OIDC_CLIENT_ID,
              clientSecret: environment.OIDC_CLIENT_SECRET,
              authorizationUrl: environment.OIDC_AUTHORIZATION_URL,
              discoveryUrl: environment.OIDC_DISCOVERY_URL,
              scopes: ['openid', 'profile', 'email'],
            },
          ],
        }),
      ],
      trustedOrigins: environment.NODE_ENV === 'development' ? ['http://localhost:3000'] : [],
      secret: environment.BETTER_AUTH_SECRET,
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
              const pageData: PageContainerCreate = {
                name: 'Welcome',
                type: 'page',
                userId: user.id,
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                workspaceId: workspace.id,
                emoji: '👋',
                parentId: null,
              };

              await containerRepository.create(pageData);
            },
          },
        },
      },
    });
  }
  return authInstance;
}

export async function getAuth() {
  await connection();
  return await initializeAuth();
}
