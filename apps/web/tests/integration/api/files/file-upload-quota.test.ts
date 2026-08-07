import { afterEach, describe, expect, test } from 'vitest';
import { getBaseUrl, getData, getOwnerClient, SEED } from '../../support/fixtures';

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

async function setWorkspaceQuota(bytes: number | null) {
  const owner = await getOwner();
  await owner.patch(`/api/v1/admin/workspaces/${SEED.workspace.id}`, { storageQuotaBytes: bytes });
}

async function setUserQuota(bytes: number | null) {
  const owner = await getOwner();
  await owner.patch(`/api/v1/admin/users/${SEED.user.id}`, { storageQuotaBytes: bytes });
}

async function uploadBytes(size: number): Promise<Response> {
  const client = await getOwner();
  const form = new FormData();
  const blob = new globalThis.Blob([new Uint8Array(Buffer.alloc(size, 'a'))], { type: 'text/plain' });
  form.set('file', blob, `quota-${size}-${Date.now()}.txt`);
  // Pin the upload to the seeded workspace we set quotas on. Without this the route falls back to
  // the owner's *most-recently-updated* workspace, which earlier suites (e.g. data-source soft
  // delete) may have shifted to a freshly created workspace — leaving the SEED-workspace quota
  // unenforced and the upload wrongly succeeding.
  form.set('workspaceId', SEED.workspace.id);
  return client.fetch('/api/v1/files', { method: 'POST', body: form });
}

async function currentUsage(): Promise<number> {
  const owner = await getOwner();
  const response = await owner.get(`/api/v1/workspaces/${SEED.workspace.id}/storage-usage`);
  const body = await getData<{ usedBytes: number; quotaBytes: number | null }>(response);
  return body.usedBytes;
}

describe('file upload storage quotas (THOTH-045)', () => {
  afterEach(async () => {
    // Always clear the quotas we might have set so other suites aren't affected.
    await setWorkspaceQuota(null);
    await setUserQuota(null);
  });

  test('GET /storage-usage returns a nullable quotaBytes (null = no limit)', async () => {
    await setWorkspaceQuota(null);
    const owner = await getOwner();
    const response = await owner.get(`/api/v1/workspaces/${SEED.workspace.id}/storage-usage`);
    expect(response.ok).toBe(true);
    const body = await getData<{ usedBytes: number; quotaBytes: number | null }>(response);
    expect(body.quotaBytes).toBeNull();
    expect(body.usedBytes).toBeGreaterThanOrEqual(0);
  });

  test('an upload exceeding the workspace quota is rejected with 409', async () => {
    // A zero-capacity workspace limit rejects any upload regardless of current usage.
    await setWorkspaceQuota(0);
    const response = await uploadBytes(1);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/workspace/i);
  });

  test('an upload that exactly reaches the workspace quota succeeds (equality)', async () => {
    const used = await currentUsage();
    const room = 32;
    await setWorkspaceQuota(used + room);
    const response = await uploadBytes(room);
    expect(response.ok).toBe(true);
  });

  test('an upload exceeding the user quota is rejected with 409', async () => {
    // No workspace limit, but a zero-capacity user limit.
    await setWorkspaceQuota(null);
    await setUserQuota(0);
    const response = await uploadBytes(1);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/user/i);
  });
});
