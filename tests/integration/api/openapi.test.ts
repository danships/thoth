import { describe, test, expect } from 'vitest';
import { getBaseUrl, createAnonymousClient } from '../support/fixtures';

describe('OpenAPI spec', () => {
  test('serves the OpenAPI spec unauthenticated', async () => {
    const baseUrl = getBaseUrl();
    const client = createAnonymousClient(baseUrl);

    const response = await client.get('/openapi.json');
    expect(response.status).toBe(200);
    const body = await response.json<{ openapi: string }>();
    expect(body.openapi).toBe('3.1.0');
  });
});
