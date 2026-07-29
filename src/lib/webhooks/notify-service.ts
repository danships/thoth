import { after } from 'next/server';
import {
  getAppRepository,
  getContainerRepository,
  getWebhookDeliveryRepository,
  getWebhookRepository,
} from '@/lib/database';
import { recordAndPrune, signPayload } from '@/lib/database/webhook-service';
import { assertPublicHttpsUrl } from './ssrf';
import { appToAccessGrant, grantAllowsContainer } from '@/lib/auth/access-grant';
import { getLogger } from '@/lib/logger';
import type {
  App,
  Container,
  DataSourceContainer,
  PageContainer,
  Webhook,
  WebhookDeliveryEvent,
  WebhookPayload,
  WebhookRawValue,
} from '@/types/database';
import type { Column, PageValue } from '@/types/schemas/entities/container';

const FETCH_TIMEOUT_MS = 5000;
const MAX_STORED_ERROR_LENGTH = 500;

export type WebhookActor = {
  // The id of the App whose own API key caused the change, if any (undefined for a
  // session-cookie-driven change) — used for `suppressOwnChanges` matching.
  appId?: string | undefined;
};

export type ValueChangeInput = Record<string, { previous: PageValue | null; new: PageValue | null }>;

/**
 * Reverse of `filterContainersByGrant`: given a changed container, finds every enabled webhook
 * whose owning App's `AccessGrant` covers it (or, for a data-source page, covers its parent data
 * source — see "Data-source rule" below), excluding archived Apps and honouring per-webhook
 * `suppressOwnChanges`. Dedupes by `webhook.id`.
 */
export async function resolveWebhooksToNotify(
  container: Container,
  workspaceId: string,
  actor: WebhookActor
): Promise<Webhook[]> {
  const webhookRepository = await getWebhookRepository();
  const candidateWebhooks = await webhookRepository.getByQuery(
    webhookRepository.createQuery().eq('workspaceId', workspaceId).eq('enabled', true)
  );

  if (candidateWebhooks.length === 0) {
    return [];
  }

  const appRepository = await getAppRepository();
  const appIds = [...new Set(candidateWebhooks.map((webhook) => webhook.appId))];
  const apps = await appRepository.getByQuery(appRepository.createQuery().in('id', appIds));
  const appsById = new Map<string, App>(apps.filter((app) => !app.archivedAt).map((app) => [app.id, app]));

  // Data-source rule: a page nested under a data source also matches a grant that covers the
  // parent data source (so rows of a scoped data source notify even under plain `containers`
  // scope, mirroring `resolvePageEmbeddedContainerIds`).
  let parentDataSource: DataSourceContainer | undefined;
  if (container.type === 'page' && container.parentId) {
    const containerRepository = await getContainerRepository();
    const parent = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', container.parentId).eq('workspaceId', workspaceId)
    );
    if (parent && parent.type === 'data-source') {
      parentDataSource = parent;
    }
  }

  const grantCache = new Map<string, ReturnType<typeof appToAccessGrant>>();
  const matched = new Map<string, Webhook>();

  for (const webhook of candidateWebhooks) {
    if (matched.has(webhook.id)) {
      continue;
    }

    const app = appsById.get(webhook.appId);
    if (!app) {
      continue;
    }

    if (webhook.suppressOwnChanges && actor.appId === webhook.appId) {
      continue;
    }

    let grantPromise = grantCache.get(app.id);
    if (!grantPromise) {
      grantPromise = appToAccessGrant(app);
      grantCache.set(app.id, grantPromise);
    }
    const grant = await grantPromise;

    const allowsContainer = await grantAllowsContainer(grant, container);
    const allowsParent = parentDataSource ? await grantAllowsContainer(grant, parentDataSource) : false;

    if (allowsContainer || allowsParent) {
      matched.set(webhook.id, webhook);
    }
  }

  return [...matched.values()];
}

/** Resolves a page's data-source parent, if any — `undefined` for root pages or non-page containers. */
async function resolveDataSourceParent(container: Container): Promise<DataSourceContainer | undefined> {
  if (container.type !== 'page' || !container.parentId) {
    return undefined;
  }
  const containerRepository = await getContainerRepository();
  const parent = await containerRepository.getOneByQuery(
    containerRepository.createQuery().eq('id', container.parentId)
  );
  return parent && parent.type === 'data-source' ? parent : undefined;
}

/**
 * Resolves a stored `PageValue` to the primitive the payload should carry: for `single-select`,
 * the option's `label` (or `null` if unset/the option no longer exists); otherwise the raw
 * `.value`. The single place internal option ids are turned into human-readable labels.
 */
function toDisplayValue(column: Column, value: PageValue | null | undefined): WebhookRawValue {
  if (!value) {
    return null;
  }
  if (column.type === 'single-select' && value.type === 'single-select') {
    if (!value.value) {
      return null;
    }
    const option = column.options.find((candidate) => candidate.id === value.value);
    return option?.label ?? null;
  }
  if ('value' in value) {
    return value.value;
  }
  return null;
}

/**
 * Assembles the outbound webhook body — the single place internal column ids/option ids are
 * resolved to human-readable column names/option labels. `values`/`dataSourceId` are only
 * included when `dataSource` is supplied; `changes` only when `valueChanges` is supplied.
 * Columns no longer present on the data source are silently skipped.
 */
export function buildPayload(
  event: WebhookDeliveryEvent,
  deliveryId: string,
  workspaceId: string,
  appId: string,
  container: PageContainer,
  dataSource?: DataSourceContainer,
  valueChanges?: ValueChangeInput
): WebhookPayload {
  const payload: WebhookPayload = {
    event,
    deliveryId,
    timestamp: new Date().toISOString(),
    workspaceId,
    appId,
    page: {
      id: container.id,
      name: container.name,
      parentId: container.parentId ?? null,
      type: 'page',
      lastUpdated: container.lastUpdated,
    },
  };

  if (!dataSource) {
    return payload;
  }

  payload.dataSourceId = dataSource.id;

  const columnsById = new Map(dataSource.columns.map((column) => [column.id, column] as const));

  const values: Record<string, WebhookRawValue> = {};
  for (const [columnId, value] of Object.entries(container.values ?? {})) {
    const column = columnsById.get(columnId);
    if (!column) {
      continue;
    }
    values[column.name] = toDisplayValue(column, value);
  }
  payload.values = values;

  if (valueChanges) {
    const changes: Record<string, { previous: WebhookRawValue; new: WebhookRawValue }> = {};
    for (const [columnId, change] of Object.entries(valueChanges)) {
      const column = columnsById.get(columnId);
      if (!column) {
        continue;
      }
      changes[column.name] = {
        previous: toDisplayValue(column, change.previous),
        new: toDisplayValue(column, change.new),
      };
    }
    if (Object.keys(changes).length > 0) {
      payload.changes = changes;
    }
  }

  return payload;
}

function truncateError(message: string): string {
  return message.length > MAX_STORED_ERROR_LENGTH ? `${message.slice(0, MAX_STORED_ERROR_LENGTH)}…` : message;
}

/**
 * Delivers `payload` to `webhook.url`. Re-runs the SSRF check immediately before every `fetch`
 * (execution-time, not just config-time — defends against DNS rebinding), signs the raw JSON
 * body with the webhook's secret, and always records the outcome as a `webhook-delivery` row —
 * a thrown fetch/timeout/SSRF-rejection becomes a `failed` row, never a thrown error.
 */
export async function deliverWebhook(webhook: Webhook, payload: WebhookPayload): Promise<void> {
  const rawBody = JSON.stringify(payload);

  try {
    await assertPublicHttpsUrl(webhook.url);

    const signature = signPayload(webhook.secret, rawBody);

    const response = await fetch(webhook.url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Thoth-Signature': signature,
        'X-Thoth-Event': payload.event,
      },
      body: rawBody,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      await recordAndPrune({
        webhookId: webhook.id,
        appId: webhook.appId,
        event: payload.event,
        containerId: payload.page.id,
        payload,
        status: 'success',
        httpStatus: response.status,
        error: null,
      });
      return;
    }

    const bodySnippet = await response.text().catch(() => '');
    await recordAndPrune({
      webhookId: webhook.id,
      appId: webhook.appId,
      event: payload.event,
      containerId: payload.page.id,
      payload,
      status: 'failed',
      httpStatus: response.status,
      error: truncateError(bodySnippet || `Non-2xx response: ${response.status}`),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown delivery error';
    await recordAndPrune({
      webhookId: webhook.id,
      appId: webhook.appId,
      event: payload.event,
      containerId: payload.page.id,
      payload,
      status: 'failed',
      httpStatus: null,
      error: truncateError(message),
    });
  }
}

export type NotifyPageChangeOptions = {
  valueChanges?: ValueChangeInput;
};

/**
 * Orchestrator invoked (via `after()`, from the page-mutation routes) once a page change has
 * already been committed and the response is on its way. Resolves the container's data-source
 * parent (if any) and the webhooks to notify, builds the payload once, then delivers to each
 * matched webhook concurrently. Never throws — every failure is self-contained inside
 * `deliverWebhook`, and resolver failures are only logged.
 */
export async function notifyPageChange(
  event: WebhookDeliveryEvent,
  container: Container,
  actor: WebhookActor,
  options: NotifyPageChangeOptions = {}
): Promise<void> {
  if (container.type !== 'page') {
    return;
  }

  try {
    const [dataSource, webhooks] = await Promise.all([
      resolveDataSourceParent(container),
      resolveWebhooksToNotify(container, container.workspaceId, actor),
    ]);

    if (webhooks.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      webhooks.map(async (webhook) => {
        const payload = buildPayload(
          event,
          crypto.randomUUID(),
          container.workspaceId,
          webhook.appId,
          container,
          dataSource,
          options.valueChanges
        );
        await deliverWebhook(webhook, payload);
      })
    );

    const logger = await getLogger();
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Webhook delivery failed unexpectedly', { error: result.reason });
      }
    }
  } catch (error) {
    const logger = await getLogger();
    logger.error('Failed to resolve/deliver webhooks for page change', { error });
  }
}

/** Schedules `notifyPageChange` to run after the response has been flushed via `next/server`'s `after()`. */
export function scheduleNotifyPageChange(
  event: WebhookDeliveryEvent,
  container: Container,
  actor: WebhookActor,
  options?: NotifyPageChangeOptions
): void {
  after(() => notifyPageChange(event, container, actor, options));
}

export type ResendResult = { delivery: import('@/types/database').WebhookDelivery; webhookDisabled: boolean };

/**
 * Re-POSTs a stored delivery's `payload` verbatim to its webhook's *current* `url` (re-running
 * the SSRF check at execution time), updating the same `webhook-delivery` row in place
 * (`status`, `httpStatus`, `error`, `attempts++`, `lastAttemptAt`) rather than creating a new
 * history row. Returns `webhookDisabled: true` (without attempting delivery) if the webhook is
 * currently disabled — the route layer maps this to a 409.
 */
export async function resendDelivery(
  appId: string,
  webhookId: string,
  deliveryId: string
): Promise<ResendResult | undefined> {
  const webhookRepository = await getWebhookRepository();
  const webhook = await webhookRepository.getOneByQuery(
    webhookRepository.createQuery().eq('id', webhookId).eq('appId', appId)
  );
  if (!webhook) {
    return undefined;
  }

  const webhookDeliveryRepository = await getWebhookDeliveryRepository();
  const delivery = await webhookDeliveryRepository.getOneByQuery(
    webhookDeliveryRepository.createQuery().eq('id', deliveryId).eq('webhookId', webhookId).eq('appId', appId)
  );
  if (!delivery) {
    return undefined;
  }

  if (!webhook.enabled) {
    return { delivery, webhookDisabled: true };
  }

  const rawBody = JSON.stringify(delivery.payload);
  const now = new Date().toISOString();

  let status: 'success' | 'failed';
  let httpStatus: number | null;
  let error: string | null;

  try {
    await assertPublicHttpsUrl(webhook.url);

    const signature = signPayload(webhook.secret, rawBody);
    const response = await fetch(webhook.url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Thoth-Signature': signature,
        'X-Thoth-Event': delivery.event,
      },
      body: rawBody,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      status = 'success';
      httpStatus = response.status;
      error = null;
    } else {
      status = 'failed';
      httpStatus = response.status;
      const bodySnippet = await response.text().catch(() => '');
      error = truncateError(bodySnippet || `Non-2xx response: ${response.status}`);
    }
  } catch (caughtError) {
    status = 'failed';
    httpStatus = null;
    error = truncateError(caughtError instanceof Error ? caughtError.message : 'Unknown delivery error');
  }

  const updated = await webhookDeliveryRepository.update({
    ...delivery,
    status,
    httpStatus,
    error,
    attempts: delivery.attempts + 1,
    lastAttemptAt: now,
  });

  return { delivery: updated, webhookDisabled: false };
}
