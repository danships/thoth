/* eslint-disable unicorn/prefer-ternary */
import { betterAuth } from 'better-auth';
import type { Auth, BetterAuthOptions } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import Database from 'better-sqlite3';
import { createPool } from 'mysql2/promise';
import { connection } from 'next/server';
import { getDatabase } from '../database';
import { createWorkspaceForUser } from '../database/seed-workspace';
import { getEnvironment } from '../environment';
import { slugify } from '../utils/slug';
import { pickRandomNerdySuffix } from '../utils/nerdy-slug';

let authInstance: Auth<BetterAuthOptions> | null = null;

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
          after: async (user: { id: string; name?: string; email?: string }) => {
            const displayName = user.name || user.email?.split('@', 1)[0] || 'my-workspace';
            // e.g. "Ada Lovelace" -> slug base "ada-lovelace-segfault", de-duplicated on the
            // rare collision (see `createWorkspaceForUser`'s `strict: false`).
            const nerdySlug = `${slugify(displayName)}-${pickRandomNerdySuffix()}`;
            await createWorkspaceForUser(user.id, displayName, { slug: nerdySlug, strict: false });
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
      }) as unknown as Auth<BetterAuthOptions>;
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
      }) as unknown as Auth<BetterAuthOptions>;
    }
  }
  if (authInstance === null) {
    throw new Error('Auth instance failed to initialize');
  }
  return authInstance;
}

export async function getAuth(outsideRequest = false) {
  if (!outsideRequest) {
    await connection();
  }
  return await initializeAuth();
}
