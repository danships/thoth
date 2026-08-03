import { describe, expect, test } from 'vitest';
import {
  createAnonymousClient,
  createBearerClient,
  getBaseUrl,
  getData,
  getOwnerClient,
  SEED,
} from '../../support/fixtures';

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

describe('.md page detail URL', () => {
  test('returns the raw Markdown body for the workspace-scoped URL, via session cookie', async () => {
    const client = await getOwner();

    const response = await client.get(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}.md`);
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('text/markdown');

    const body = await response.text();
    expect(body).toContain(SEED.pages.root.contentHeading);
  });

  test('returns the raw Markdown body for the legacy bare URL, via session cookie', async () => {
    const client = await getOwner();

    const response = await client.get(`/pages/${SEED.pages.root.id}.md`);
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('text/markdown');

    const body = await response.text();
    expect(body).toContain(SEED.pages.root.contentHeading);
  });

  test('is rejected with 401 when neither a session cookie nor a bearer token is present', async () => {
    const client = createAnonymousClient(getBaseUrl());

    const response = await client.get(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}.md`);
    expect(response.status).toBe(401);
  });

  test('returns the raw Markdown body for a workspace-scoped App API key (bearer auth)', async () => {
    const client = await getOwner();

    const appResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Markdown URL Read App',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await client.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerClient = createBearerClient(getBaseUrl(), key.secret);
    const response = await bearerClient.get(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}.md`);
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('text/markdown');

    const body = await response.text();
    expect(body).toContain(SEED.pages.root.contentHeading);
  });

  test('an App key scoped to an unrelated container is rejected (403)', async () => {
    const client = await getOwner();

    const appResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Markdown URL Scoped App',
      permission: 'read',
      scopeType: 'containers',
      attributionMode: 'creator',
      containerIds: [SEED.pages.favoriteToggle.id],
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await client.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerClient = createBearerClient(getBaseUrl(), key.secret);
    const response = await bearerClient.get(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}.md`);
    expect(response.status).toBe(403);
  });
});
