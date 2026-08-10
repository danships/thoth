import { afterAll, describe, expect, test } from 'vitest';
import {
  createAnonymousClient,
  createBearerClient,
  getBaseUrl,
  getData,
  getOwnerClient,
  getSecondUserClient,
  SEED,
} from '../../support/fixtures';

async function setSelfService(enabled: boolean) {
  const owner = await getOwnerClient(getBaseUrl());
  await owner.patch('/api/v1/admin/settings', { allowUserWorkspaceCreation: enabled });
}

describe('platform capabilities & workspace-creation policy (THOTH-045)', () => {
  afterAll(async () => {
    await setSelfService(true);
  });

  test('GET /platform/capabilities requires a cookie session (401 anonymous, 401 bearer)', async () => {
    const anon = createAnonymousClient(getBaseUrl());
    const anonResponse = await anon.get('/api/v1/platform/capabilities');
    expect(anonResponse.status).toBe(401);

    const owner = await getOwnerClient(getBaseUrl());
    const appResponse = await owner.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Capabilities Bearer App',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await owner.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<{ secret: string }>(keyResponse);
    const bearer = createBearerClient(getBaseUrl(), key.secret);
    const bearerResponse = await bearer.get('/api/v1/platform/capabilities');
    expect(bearerResponse.status).toBe(401);
  });

  test('reports isPlatformAdmin correctly for admin vs non-admin', async () => {
    await setSelfService(true);

    const owner = await getOwnerClient(getBaseUrl());
    const adminCaps = await getData<{ isPlatformAdmin: boolean; canCreateWorkspace: boolean }>(
      await owner.get('/api/v1/platform/capabilities')
    );
    expect(adminCaps.isPlatformAdmin).toBe(true);
    expect(adminCaps.canCreateWorkspace).toBe(true);

    const nonAdmin = await getSecondUserClient(getBaseUrl());
    const userCaps = await getData<{ isPlatformAdmin: boolean; canCreateWorkspace: boolean }>(
      await nonAdmin.get('/api/v1/platform/capabilities')
    );
    expect(userCaps.isPlatformAdmin).toBe(false);
    expect(userCaps.canCreateWorkspace).toBe(true);
  });

  test('when self-service is disabled, canCreateWorkspace is false for a normal user but true for an admin', async () => {
    await setSelfService(false);
    try {
      const nonAdmin = await getSecondUserClient(getBaseUrl());
      const userCaps = await getData<{ canCreateWorkspace: boolean }>(
        await nonAdmin.get('/api/v1/platform/capabilities')
      );
      expect(userCaps.canCreateWorkspace).toBe(false);

      const owner = await getOwnerClient(getBaseUrl());
      const adminCaps = await getData<{ canCreateWorkspace: boolean }>(
        await owner.get('/api/v1/platform/capabilities')
      );
      expect(adminCaps.canCreateWorkspace).toBe(true);
    } finally {
      await setSelfService(true);
    }
  });

  test('POST /workspaces is blocked (403) for a normal user when self-service is disabled', async () => {
    await setSelfService(false);
    try {
      const nonAdmin = await getSecondUserClient(getBaseUrl());
      const response = await nonAdmin.post('/api/v1/workspaces', { name: 'Should Be Blocked' });
      expect(response.status).toBe(403);
    } finally {
      await setSelfService(true);
    }
  });

  test('POST /workspaces is allowed for a platform admin even when self-service is disabled', async () => {
    await setSelfService(false);
    try {
      const owner = await getOwnerClient(getBaseUrl());
      const response = await owner.post('/api/v1/workspaces', { name: 'Admin Extra Workspace' });
      expect(response.ok).toBe(true);
    } finally {
      await setSelfService(true);
    }
  });

  test('POST /workspaces succeeds for a normal user when self-service is enabled', async () => {
    await setSelfService(true);
    const nonAdmin = await getSecondUserClient(getBaseUrl());
    const response = await nonAdmin.post('/api/v1/workspaces', { name: 'Self Service Workspace' });
    expect(response.ok).toBe(true);
  });
});
