/* eslint-disable unicorn/prefer-ternary */
import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import Database from 'better-sqlite3';
import { createPool } from 'mysql2/promise';
import { connection } from 'next/server';
import type { PageContainerCreate, WorkspaceCreate } from '@/types/database';
import { getContainerRepository, getDatabase, getWorkspaceRepository } from '../database';
import { getEnvironment } from '../environment';

let authInstance: ReturnType<typeof betterAuth> | null = null;

/**
 * Creates a database adapter based on the connection string.
 * Supports both SQLite (sqlite://) and MySQL (mysql://) connection strings.
 */
function createDatabaseAdapter(connectionString: string) {
  if (connectionString.startsWith('sqlite://')) {
    const databasePath = connectionString.replace('sqlite://', '');
    return new Database(databasePath);
  }
  return createPool(connectionString);
}

/**
 * Checks if all OIDC environment variables are configured.
 * If all are present, OIDC authentication will be used.
 * If any are missing, credentials (email/password) authentication will be used.
 */
function hasOidcConfig(environment: Awaited<ReturnType<typeof getEnvironment>>): boolean {
  return Boolean(
    environment.OIDC_CLIENT_ID &&
      environment.OIDC_CLIENT_SECRET &&
      environment.OIDC_DISCOVERY_URL &&
      environment.OIDC_AUTHORIZATION_URL
  );
}

async function initializeAuth() {
  if (authInstance === null) {
    await getDatabase();

    const environment = await getEnvironment();
    const useOidc = hasOidcConfig(environment);

    const databaseHooks = {
      user: {
        create: {
          after: async (user: { id: string }) => {
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
    };

    if (useOidc) {
      // OIDC authentication mode
      authInstance = betterAuth({
        database: createDatabaseAdapter(environment.DB),
        plugins: [
          genericOAuth({
            config: [
              {
                providerId: 'oidc',
                clientId: environment.OIDC_CLIENT_ID!,
                clientSecret: environment.OIDC_CLIENT_SECRET!,
                authorizationUrl: environment.OIDC_AUTHORIZATION_URL!,
                discoveryUrl: environment.OIDC_DISCOVERY_URL!,
                scopes: ['openid', 'profile', 'email'],
              },
            ],
          }),
        ],
        trustedOrigins: environment.NODE_ENV === 'development' ? ['http://localhost:3000'] : [],
        secret: environment.BETTER_AUTH_SECRET,
        hooks: {},
        databaseHooks,
      });
    } else {
      // Credentials (email/password) authentication mode
      authInstance = betterAuth({
        database: createDatabaseAdapter(environment.DB),
        emailAndPassword: {
          enabled: true,
        },
        trustedOrigins: environment.NODE_ENV === 'development' ? ['http://localhost:3000'] : [],
        secret: environment.BETTER_AUTH_SECRET,
        hooks: {},
        databaseHooks,
      });
    }
  }
  return authInstance;
}

export async function getAuth(outsideRequest = false) {
  if (!outsideRequest) {
    await connection();
  }
  return await initializeAuth();
}
