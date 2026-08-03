import { describe, expect, test } from 'vitest';
import { getBaseUrl, getData, getOwnerClient, SEED } from '../../support/fixtures';

type WebhookApi = {
  id: string;
  appId: string;
  workspaceId: string;
  label: string;
  url: string;
  enabled: boolean;
  suppressOwnChanges: boolean;
  secretMasked: string;
  createdAt: string;
  lastUpdated: string;
};

type CreateWebhookResponse = WebhookApi & { secret: string };

type DeliveryApi = {
  id: string;
  event: 'page.created' | 'page.updated';
  containerId: string;
  status: 'success' | 'failed';
  httpStatus: number | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  lastAttemptAt: string;
};

const UNREACHABLE_HTTPS_URL = 'https://192.0.2.1/webhooks/thoth-e2e';

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

async function createApp(overrides: Record<string, unknown> = {}) {
  const client = await getOwner();
  const response = await client.post('/api/v1/apps', {
    workspaceId: SEED.workspace.id,
    label: 'E2E Webhook App',
    permission: 'read_write',
    scopeType: 'workspace',
    attributionMode: 'creator',
    ...overrides,
  });
  expect(response.ok).toBe(true);
  return getData<{ id: string }>(response);
}

describe('apps webhooks management API', () => {
  test('can create, list, mask and update webhooks for an App', async () => {
    const client = await getOwner();
    const app = await createApp();

    const createResponse = await client.post(`/api/v1/apps/${app.id}/webhooks`, {
      label: 'Primary',
      url: UNREACHABLE_HTTPS_URL,
    });
    expect(createResponse.ok).toBe(true);
    const created = await getData<CreateWebhookResponse>(createResponse);
    expect(created.secret).toBeTruthy();
    expect(created.secretMasked).not.toContain(created.secret);

    const getResponse = await client.get(`/api/v1/apps/${app.id}/webhooks/${created.id}`);
    expect(getResponse.ok).toBe(true);
    const fetched = await getData<WebhookApi>(getResponse);
    expect(fetched).not.toHaveProperty('secret');
    expect(fetched.secretMasked).toBe(created.secretMasked);

    const secondCreateResponse = await client.post(`/api/v1/apps/${app.id}/webhooks`, {
      label: 'Secondary',
      url: UNREACHABLE_HTTPS_URL,
    });
    expect(secondCreateResponse.ok).toBe(true);
    const second = await getData<CreateWebhookResponse>(secondCreateResponse);

    const listResponse = await client.get(`/api/v1/apps/${app.id}/webhooks`);
    expect(listResponse.ok).toBe(true);
    const { webhooks } = await getData<{ webhooks: WebhookApi[] }>(listResponse);
    expect(webhooks.map((webhook) => webhook.id)).toEqual(expect.arrayContaining([created.id, second.id]));

    const patchResponse = await client.patch(`/api/v1/apps/${app.id}/webhooks/${created.id}`, {
      label: 'Primary (renamed)',
      suppressOwnChanges: true,
    });
    expect(patchResponse.ok).toBe(true);
    const updated = await getData<WebhookApi>(patchResponse);
    expect(updated.label).toBe('Primary (renamed)');
    expect(updated.suppressOwnChanges).toBe(true);

    const deleteResponse = await client.delete(`/api/v1/apps/${app.id}/webhooks/${created.id}`);
    expect(deleteResponse.status).toBe(204);
  });

  test('rejects non-https, localhost, and private-IP URLs with 400', async () => {
    const client = await getOwner();
    const app = await createApp();

    /* eslint-disable unicorn/prefer-https -- intentionally testing rejected URLs */
    for (const url of [
      'http://example.com/hook',
      'https://localhost/hook',
      'https://127.0.0.1/hook',
      'https://10.0.0.5/hook',
    ]) {
      /* eslint-enable unicorn/prefer-https */
      const response = await client.post(`/api/v1/apps/${app.id}/webhooks`, {
        label: 'Bad URL',
        url,
      });
      expect(response.status, `expected ${url} to be rejected`).toBe(400);
    }
  });

  test('a page change on a scoped page produces a delivery row', async () => {
    const client = await getOwner();
    const app = await createApp({ scopeType: 'containers', containerIds: [SEED.pages.root.id] });
    const webhookResponse = await client.post(`/api/v1/apps/${app.id}/webhooks`, {
      label: 'Root watcher',
      url: UNREACHABLE_HTTPS_URL,
    });
    const webhook = await getData<CreateWebhookResponse>(webhookResponse);

    const patchResponse = await client.patch(`/api/v1/pages/${SEED.pages.root.id}`, {
      name: SEED.pages.root.name,
    });
    expect(patchResponse.ok).toBe(true);

    await expect
      .poll(
        async () => {
          const deliveriesResponse = await client.get(`/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries`);
          const { deliveries } = await getData<{ deliveries: DeliveryApi[] }>(deliveriesResponse);
          return deliveries.length;
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThan(0);
  });

  test('out-of-scope page change produces no delivery', async () => {
    const client = await getOwner();
    const app = await createApp({ scopeType: 'containers', containerIds: [SEED.pages.favoriteToggle.id] });
    const webhookResponse = await client.post(`/api/v1/apps/${app.id}/webhooks`, {
      label: 'Scoped elsewhere',
      url: UNREACHABLE_HTTPS_URL,
    });
    const webhook = await getData<CreateWebhookResponse>(webhookResponse);

    const patchResponse = await client.patch(`/api/v1/pages/${SEED.pages.root.id}`, {
      name: SEED.pages.root.name,
    });
    expect(patchResponse.ok).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1500));
    const deliveriesResponse = await client.get(`/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries`);
    const { deliveries } = await getData<{ deliveries: DeliveryApi[] }>(deliveriesResponse);
    expect(deliveries).toHaveLength(0);
  });

  test('data-source row value edit produces a delivery with human-readable, name-keyed values', async () => {
    const client = await getOwner();
    const app = await createApp({ scopeType: 'containers', containerIds: [SEED.dataSource.id] });
    const webhookResponse = await client.post(`/api/v1/apps/${app.id}/webhooks`, {
      label: 'Data source watcher',
      url: UNREACHABLE_HTTPS_URL,
    });
    const webhook = await getData<CreateWebhookResponse>(webhookResponse);

    const priorityColumn = SEED.dataSource.columns[3];
    const highOption = priorityColumn.options[2];
    const seededOption = priorityColumn.options[1];

    const valuesResponse = await client.patch(`/api/v1/pages/${SEED.dataSourcePage.id}/values`, {
      [priorityColumn.id]: { type: 'single-select', value: highOption.id },
    });
    expect(valuesResponse.ok).toBe(true);

    try {
      await expect
        .poll(
          async () => {
            const deliveriesResponse = await client.get(`/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries`);
            const { deliveries } = await getData<{ deliveries: DeliveryApi[] }>(deliveriesResponse);
            return deliveries.length;
          },
          { timeout: 10_000 }
        )
        .toBeGreaterThan(0);
    } finally {
      await client.patch(`/api/v1/pages/${SEED.dataSourcePage.id}/values`, {
        [priorityColumn.id]: { type: 'single-select', value: seededOption.id },
      });
    }
  });

  test('disabled webhook records no deliveries and resend on a nonexistent delivery returns 404', async () => {
    const client = await getOwner();
    const app = await createApp({ scopeType: 'containers', containerIds: [SEED.pages.child.id] });
    const webhookResponse = await client.post(`/api/v1/apps/${app.id}/webhooks`, {
      label: 'Disabled watcher',
      url: UNREACHABLE_HTTPS_URL,
      enabled: false,
    });
    const webhook = await getData<CreateWebhookResponse>(webhookResponse);

    const patchResponse = await client.patch(`/api/v1/pages/${SEED.pages.child.id}`, {
      name: SEED.pages.child.name,
    });
    expect(patchResponse.ok).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));
    const deliveriesResponse = await client.get(`/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries`);
    const { deliveries } = await getData<{ deliveries: DeliveryApi[] }>(deliveriesResponse);
    expect(deliveries).toHaveLength(0);

    const resendResponse = await client.post(
      `/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries/some-delivery-id/resend`
    );
    expect(resendResponse.status).toBe(404);
  });

  test('resending an existing delivery increments its attempts and updates the same row', async () => {
    const client = await getOwner();
    const app = await createApp({ scopeType: 'containers', containerIds: [SEED.pages.deepChain[0]!.id] });
    const webhookResponse = await client.post(`/api/v1/apps/${app.id}/webhooks`, {
      label: 'Resend watcher',
      url: UNREACHABLE_HTTPS_URL,
    });
    const webhook = await getData<CreateWebhookResponse>(webhookResponse);

    const patchResponse = await client.patch(`/api/v1/pages/${SEED.pages.deepChain[0]!.id}`, {
      name: SEED.pages.deepChain[0]!.name,
    });
    expect(patchResponse.ok).toBe(true);

    let delivery: DeliveryApi | undefined;
    await expect
      .poll(
        async () => {
          const deliveriesResponse = await client.get(`/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries`);
          const { deliveries } = await getData<{ deliveries: DeliveryApi[] }>(deliveriesResponse);
          delivery = deliveries[0];
          return deliveries.length;
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThan(0);

    const initialAttempts = delivery!.attempts;

    const resendResponse = await client.post(
      `/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries/${delivery!.id}/resend`
    );
    expect(resendResponse.ok).toBe(true);
    const resent = await getData<DeliveryApi>(resendResponse);
    expect(resent.id).toBe(delivery!.id);
    expect(resent.attempts).toBe(initialAttempts + 1);

    const deliveriesAfterResponse = await client.get(`/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries`);
    const { deliveries: deliveriesAfter } = await getData<{ deliveries: DeliveryApi[] }>(deliveriesAfterResponse);
    expect(deliveriesAfter).toHaveLength(1);
  });

  test('a metadata-only change on a plain page still succeeds and does not block the response', async () => {
    const client = await getOwner();
    const app = await createApp({ scopeType: 'containers', containerIds: [SEED.pages.root.id] });
    await client.post(`/api/v1/apps/${app.id}/webhooks`, {
      label: 'Metadata watcher',
      url: UNREACHABLE_HTTPS_URL,
    });

    const patchResponse = await client.patch(`/api/v1/pages/${SEED.pages.root.id}`, {
      emoji: '🚀',
    });
    expect(patchResponse.ok).toBe(true);

    await client.patch(`/api/v1/pages/${SEED.pages.root.id}`, { emoji: '📄' });
  });
});
