import { request as playwrightRequest } from '@playwright/test';
import { test, expect } from './fixtures/test';

test('serves the OpenAPI spec unauthenticated', async ({ baseURL }) => {
  expect(baseURL).toBeTruthy();

  const request = await playwrightRequest.newContext({
    ...(baseURL ? { baseURL } : {}),
    storageState: { cookies: [], origins: [] },
  });

  const response = await request.get('/openapi.json');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.openapi).toBe('3.1.0');

  await request.dispose();
});
