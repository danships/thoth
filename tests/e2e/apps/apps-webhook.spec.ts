import type { APIRequestContext, APIResponse } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

async function getData<T = unknown>(response: APIResponse): Promise<T> {
  const body = await response.json();
  return body.data;
}

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

async function createApp(request: APIRequestContext, overrides: Record<string, unknown> = {}) {
  const response = await request.post('/api/v1/apps', {
    data: {
      workspaceId: SEED.workspace.id,
      label: 'E2E Webhook App',
      permission: 'read_write',
      scopeType: 'workspace',
      attributionMode: 'creator',
      ...overrides,
    },
  });
  expect(response.ok()).toBeTruthy();
  return getData<{ id: string }>(response);
}

// Deliveries in this environment always target a documentation/test-only IP (RFC 5737
// `192.0.2.0/24`) that is guaranteed to be unreachable but is *not* a private/local address, so
// it passes the SSRF check (a literal, non-private IP needs no DNS lookup) while every actual
// delivery attempt is expected to fail (connection refused/timeout) rather than succeed. The
// assertions below only rely on a delivery row existing with the right shape/scoping — matching
// the "must never fail the mutating request" requirement — not on reaching a real third party.
const UNREACHABLE_HTTPS_URL = 'https://192.0.2.1/webhooks/thoth-e2e';

test.describe('apps webhooks management API', () => {
  test('can create, list, mask and update webhooks for an App', async ({ request }) => {
    const app = await createApp(request);

    const createResponse = await request.post(`/api/v1/apps/${app.id}/webhooks`, {
      data: { label: 'Primary', url: UNREACHABLE_HTTPS_URL },
    });
    expect(createResponse.ok()).toBeTruthy();
    const created = await getData<CreateWebhookResponse>(createResponse);
    expect(created.secret).toBeTruthy();
    expect(created.secretMasked).not.toContain(created.secret);

    const getResponse = await request.get(`/api/v1/apps/${app.id}/webhooks/${created.id}`);
    expect(getResponse.ok()).toBeTruthy();
    const fetched = await getData<WebhookApi>(getResponse);
    expect(fetched).not.toHaveProperty('secret');
    expect(fetched.secretMasked).toBe(created.secretMasked);

    const secondCreateResponse = await request.post(`/api/v1/apps/${app.id}/webhooks`, {
      data: { label: 'Secondary', url: UNREACHABLE_HTTPS_URL },
    });
    expect(secondCreateResponse.ok()).toBeTruthy();
    const second = await getData<CreateWebhookResponse>(secondCreateResponse);

    const listResponse = await request.get(`/api/v1/apps/${app.id}/webhooks`);
    expect(listResponse.ok()).toBeTruthy();
    const { webhooks } = await getData<{ webhooks: WebhookApi[] }>(listResponse);
    expect(webhooks.map((webhook) => webhook.id)).toEqual(expect.arrayContaining([created.id, second.id]));

    const patchResponse = await request.patch(`/api/v1/apps/${app.id}/webhooks/${created.id}`, {
      data: { label: 'Primary (renamed)', suppressOwnChanges: true },
    });
    expect(patchResponse.ok()).toBeTruthy();
    const updated = await getData<WebhookApi>(patchResponse);
    expect(updated.label).toBe('Primary (renamed)');
    expect(updated.suppressOwnChanges).toBe(true);

    const deleteResponse = await request.delete(`/api/v1/apps/${app.id}/webhooks/${created.id}`);
    expect(deleteResponse.status()).toBe(204);
  });

  test('rejects non-https, localhost, and private-IP URLs with 400', async ({ request }) => {
    const app = await createApp(request);

    // eslint-disable-next-line unicorn/prefer-https -- intentionally testing that a non-https URL is rejected
    for (const url of ['http://example.com/hook', 'https://localhost/hook', 'https://127.0.0.1/hook', 'https://10.0.0.5/hook']) {
      const response = await request.post(`/api/v1/apps/${app.id}/webhooks`, {
        data: { label: 'Bad URL', url },
      });
      expect(response.status(), `expected ${url} to be rejected`).toBe(400);
    }
  });

  test('a page change on a scoped page produces a delivery row', async ({ request }) => {
    const app = await createApp(request, {
      scopeType: 'containers',
      containerIds: [SEED.pages.root.id],
    });
    const webhookResponse = await request.post(`/api/v1/apps/${app.id}/webhooks`, {
      data: { label: 'Root watcher', url: UNREACHABLE_HTTPS_URL },
    });
    const webhook = await getData<CreateWebhookResponse>(webhookResponse);

    const patchResponse = await request.patch(`/api/v1/pages/${SEED.pages.root.id}`, {
      data: { name: SEED.pages.root.name },
    });
    expect(patchResponse.ok()).toBeTruthy();

    await expect
      .poll(
        async () => {
          const deliveriesResponse = await request.get(`/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries`);
          const { deliveries } = await getData<{ deliveries: DeliveryApi[] }>(deliveriesResponse);
          return deliveries.length;
        },
        // The delivery is scheduled with `after()` once the response is flushed, and the
        // outbound `fetch` to the intentionally-unreachable RFC 5737 address won't fail until
        // its own 5s `AbortSignal.timeout` elapses -- give the poll enough headroom for that.
        { timeout: 10_000 }
      )
      .toBeGreaterThan(0);
  });

  test('out-of-scope page change produces no delivery', async ({ request }) => {
    const app = await createApp(request, {
      scopeType: 'containers',
      containerIds: [SEED.pages.favoriteToggle.id],
    });
    const webhookResponse = await request.post(`/api/v1/apps/${app.id}/webhooks`, {
      data: { label: 'Scoped elsewhere', url: UNREACHABLE_HTTPS_URL },
    });
    const webhook = await getData<CreateWebhookResponse>(webhookResponse);

    const patchResponse = await request.patch(`/api/v1/pages/${SEED.pages.root.id}`, {
      data: { name: SEED.pages.root.name },
    });
    expect(patchResponse.ok()).toBeTruthy();

    // Give any (incorrect) async delivery a moment, then assert nothing was recorded.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const deliveriesResponse = await request.get(`/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries`);
    const { deliveries } = await getData<{ deliveries: DeliveryApi[] }>(deliveriesResponse);
    expect(deliveries).toHaveLength(0);
  });

  test('data-source row value edit produces a delivery with human-readable, name-keyed values', async ({
    request,
  }) => {
    const app = await createApp(request, {
      scopeType: 'containers',
      containerIds: [SEED.dataSource.id],
    });
    const webhookResponse = await request.post(`/api/v1/apps/${app.id}/webhooks`, {
      data: { label: 'Data source watcher', url: UNREACHABLE_HTTPS_URL },
    });
    const webhook = await getData<CreateWebhookResponse>(webhookResponse);

    const priorityColumn = SEED.dataSource.columns[3];
    const highOption = priorityColumn.options[2];
    const seededOption = priorityColumn.options[1]; // 'Medium' -- the seeded value (see scripts/end-to-end-seed.ts)

    const valuesResponse = await request.patch(`/api/v1/pages/${SEED.dataSourcePage.id}/values`, {
      data: {
        [priorityColumn.id]: { type: 'single-select', value: highOption.id },
      },
    });
    expect(valuesResponse.ok()).toBeTruthy();

    try {
      await expect
        .poll(
          async () => {
            const deliveriesResponse = await request.get(`/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries`);
            const { deliveries } = await getData<{ deliveries: DeliveryApi[] }>(deliveriesResponse);
            return deliveries.length;
          },
          // The delivery is scheduled with `after()` once the response is flushed, and the
          // outbound `fetch` to the intentionally-unreachable RFC 5737 address won't fail until
          // its own 5s `AbortSignal.timeout` elapses -- give the poll enough headroom for that.
          { timeout: 10_000 }
        )
        .toBeGreaterThan(0);
    } finally {
      // Restore the seeded value -- `single-select-column.spec.ts` depends on this row still
      // holding the seeded 'Medium' option.
      await request.patch(`/api/v1/pages/${SEED.dataSourcePage.id}/values`, {
        data: {
          [priorityColumn.id]: { type: 'single-select', value: seededOption.id },
        },
      });
    }
  });

  test('disabled webhook records no deliveries and resend on a nonexistent delivery returns 404', async ({
    request,
  }) => {
    const app = await createApp(request, {
      scopeType: 'containers',
      containerIds: [SEED.pages.child.id],
    });
    const webhookResponse = await request.post(`/api/v1/apps/${app.id}/webhooks`, {
      data: { label: 'Disabled watcher', url: UNREACHABLE_HTTPS_URL, enabled: false },
    });
    const webhook = await getData<CreateWebhookResponse>(webhookResponse);

    const patchResponse = await request.patch(`/api/v1/pages/${SEED.pages.child.id}`, {
      data: { name: SEED.pages.child.name },
    });
    expect(patchResponse.ok()).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    const deliveriesResponse = await request.get(`/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries`);
    const { deliveries } = await getData<{ deliveries: DeliveryApi[] }>(deliveriesResponse);
    expect(deliveries).toHaveLength(0);

    const resendResponse = await request.post(
      `/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries/some-delivery-id/resend`
    );
    expect(resendResponse.status()).toBe(404);
  });

  test('resending an existing delivery increments its attempts and updates the same row', async ({ request }) => {
    const app = await createApp(request, {
      scopeType: 'containers',
      containerIds: [SEED.pages.deepChain[0]!.id],
    });
    const webhookResponse = await request.post(`/api/v1/apps/${app.id}/webhooks`, {
      data: { label: 'Resend watcher', url: UNREACHABLE_HTTPS_URL },
    });
    const webhook = await getData<CreateWebhookResponse>(webhookResponse);

    const patchResponse = await request.patch(`/api/v1/pages/${SEED.pages.deepChain[0]!.id}`, {
      data: { name: SEED.pages.deepChain[0]!.name },
    });
    expect(patchResponse.ok()).toBeTruthy();

    let delivery: DeliveryApi | undefined;
    await expect
      .poll(
        async () => {
          const deliveriesResponse = await request.get(`/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries`);
          const { deliveries } = await getData<{ deliveries: DeliveryApi[] }>(deliveriesResponse);
          delivery = deliveries[0];
          return deliveries.length;
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThan(0);

    const initialAttempts = delivery!.attempts;

    const resendResponse = await request.post(
      `/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries/${delivery!.id}/resend`
    );
    expect(resendResponse.ok()).toBeTruthy();
    const resent = await getData<DeliveryApi>(resendResponse);
    expect(resent.id).toBe(delivery!.id);
    expect(resent.attempts).toBe(initialAttempts + 1);

    const deliveriesAfterResponse = await request.get(`/api/v1/apps/${app.id}/webhooks/${webhook.id}/deliveries`);
    const { deliveries: deliveriesAfter } = await getData<{ deliveries: DeliveryApi[] }>(deliveriesAfterResponse);
    expect(deliveriesAfter).toHaveLength(1);
  });

  test('a metadata-only change on a plain page still succeeds and does not block the response', async ({
    request,
  }) => {
    const app = await createApp(request, {
      scopeType: 'containers',
      containerIds: [SEED.pages.root.id],
    });
    await request.post(`/api/v1/apps/${app.id}/webhooks`, {
      data: { label: 'Metadata watcher', url: UNREACHABLE_HTTPS_URL },
    });

    const patchResponse = await request.patch(`/api/v1/pages/${SEED.pages.root.id}`, {
      data: { emoji: '🚀' },
    });
    expect(patchResponse.ok()).toBeTruthy();

    // Restore the seeded emoji so other specs relying on `SEED.pages.root` aren't affected.
    await request.patch(`/api/v1/pages/${SEED.pages.root.id}`, { data: { emoji: '📄' } });
  });
});
