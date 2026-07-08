import { NextResponse } from 'next/server';
import type { GetAuthConfigResponse } from '@/types/api';
import { getEnvironment } from '@/lib/environment';

/**
 * Returns the authentication mode configured for this instance.
 * - 'oidc': OpenID Connect / SSO authentication
 * - 'credentials': Email/password authentication
 */
export async function GET(): Promise<NextResponse<GetAuthConfigResponse>> {
  const environment = await getEnvironment();

  const hasOidcConfig = Boolean(
    environment.OIDC_CLIENT_ID &&
    environment.OIDC_CLIENT_SECRET &&
    environment.OIDC_DISCOVERY_URL &&
    environment.OIDC_AUTHORIZATION_URL
  );

  return NextResponse.json({
    authMode: hasOidcConfig ? 'oidc' : 'credentials',
  });
}
