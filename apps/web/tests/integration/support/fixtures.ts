// tests/integration/support/fixtures.ts
//
// Shared fixtures for API integration tests.
// Exposes the base URL, authenticated clients, and the SEED object.

export { SEED } from '../../fixtures/seed';
export {
  getOwnerClient,
  getSecondUserClient,
  getThirdUserClient,
  createAnonymousClient,
  createBearerClient,
  createSessionClient,
  getData,
} from './api-client';
export type { ApiClient, ApiResponse } from './api-client';

/** Get the integration test server base URL. */
export function getBaseUrl(): string {
  const url = process.env['INTEGRATION_BASE_URL'];
  if (!url) throw new Error('INTEGRATION_BASE_URL not set — is global-setup running?');
  return url;
}
