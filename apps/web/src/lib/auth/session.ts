import type { NextRequest } from 'next/server';
import type { User } from 'better-auth';
import { getAuth } from './config';
import { NotAuthorizedError } from '@/lib/errors/not-authorized-error';
import { appToAccessGrant, type AccessGrant } from './access-grant';
import { toAppOwnerId, verifyApiKey } from '@/lib/database/app-service';
import { getApiKeyRepository } from '@/lib/database';

export type ApiKeySession = {
  user: User;
  appContext?: {
    appId: string;
    accessGrant: AccessGrant;
  };
};

/**
 * Cookie-only session lookup — the original behaviour of `getSession()` before bearer-token
 * support was added. Deliberately resolves the session from the *given request's own headers*
 * (`request.headers`) rather than the ambient `headers()` helper from `next/headers`: the latter
 * is backed by request-scoped `AsyncLocalStorage` which, under concurrent requests, can resolve
 * to the wrong in-flight request's headers — which would let a cookie-less bearer-token request
 * incorrectly inherit an unrelated request's session cookie.
 */
export async function getSessionFromCookie(headersList: Headers): Promise<ApiKeySession | null> {
  const auth = await getAuth();
  const session = await auth!.api.getSession({
    headers: headersList,
  });

  if (!session) {
    return null;
  }

  return session as ApiKeySession;
}

export async function getSession(request: NextRequest): Promise<ApiKeySession> {
  const session = await getSessionFromCookie(request.headers);

  if (!session) {
    throw new NotAuthorizedError('Session not found');
  }

  return session;
}

/**
 * Resolves either the session cookie or, absent one, an `Authorization: Bearer <key>` header
 * into a session-shaped object. The cookie always wins when both are present, so a scoped API
 * key can never accidentally *restrict* an otherwise fully-authenticated human session.
 *
 * For a bearer-token match, synthesizes `session.user.id` as `effectiveUserId` — the App's own
 * `createdByUserId` (`attributionMode: 'creator'`) or `toAppOwnerId(app.id)`
 * (`attributionMode: 'app'`) — and attaches `appContext` (`appId` + the resolved
 * `AccessGrant`) so `apiRoute`/downstream route handlers can enforce permission/scope via
 * `src/lib/auth/access-grant.ts`. Throws `NotAuthorizedError` (401) if neither a valid cookie
 * session nor a valid bearer token is present.
 */
export async function getSessionOrApiKey(request: NextRequest): Promise<ApiKeySession> {
  const cookieSession = await getSessionFromCookie(request.headers);
  if (cookieSession) {
    return cookieSession;
  }

  const authorizationHeader = request.headers.get('authorization');
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new NotAuthorizedError('Session not found');
  }

  const rawToken = authorizationHeader.slice('Bearer '.length).trim();
  const verified = rawToken ? await verifyApiKey(rawToken) : null;

  if (!verified) {
    throw new NotAuthorizedError('Invalid or expired API key');
  }

  const { apiKey, app } = verified;

  // Fire-and-forget: never block/fail the request on this bookkeeping update.
  const apiKeyRepository = await getApiKeyRepository();
  void apiKeyRepository.update({ ...apiKey, lastUsedAt: new Date().toISOString() }).catch(() => undefined);

  const effectiveUserId = app.attributionMode === 'app' ? toAppOwnerId(app.id) : app.createdByUserId;

  return {
    user: {
      id: effectiveUserId,
      name: effectiveUserId,
      email: `${effectiveUserId}@apps.thoth.local`,
      emailVerified: true,
      image: null,
      createdAt: new Date(app.createdAt),
      updatedAt: new Date(app.lastUpdated),
    } as unknown as User,
    appContext: {
      appId: app.id,
      accessGrant: await appToAccessGrant(app),
    },
  };
}
