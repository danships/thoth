import { randomUUID } from 'node:crypto';
import {
  completeDelivery,
  createPendingDelivery,
  findDeliveryBySourceJobAndWebhook,
  getContainerRepository,
  getWebhookDeliveryRepository,
  type PageValue,
} from '@thoth/database';
import {
  webhookDispatchPayloadV1Schema,
  type JobCoalescePolicy,
  type JobDefinition,
  type JobExecutionContext,
  type WebhookDispatchPayloadV1,
} from '@thoth/job-protocol';
import { buildPayload, type ValueChangeInput } from './build-payload.js';
import { resolveDataSourceParent, resolveWebhooksToNotify } from './resolve-webhooks.js';

const TRAILING_DEBOUNCE_MS = 3000;
const MAX_DEBOUNCE_MS = 15_000;
const DISPATCH_MAX_ATTEMPTS = 1; // Best-effort orchestration; each destination retries independently via `webhook.deliver`.

/** Derived active-dedupe key (THOTH-061 spec): `webhook:<workspaceId>:<containerId>:<actor.type>:<actor id>`. */
export function webhookDispatchDedupeKey(payload: WebhookDispatchPayloadV1): string {
  const actorId = payload.actor.type === 'user' ? payload.actor.userId : payload.actor.appId;
  return `webhook:${payload.workspaceId}:${payload.containerId}:${payload.actor.type}:${actorId}`;
}

function deepEqual(a: PageValue | null, b: PageValue | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Merges a newly-arriving `webhook.dispatch` payload into an already-queued one sharing the
 * same dedupe key (THOTH-061 merge rules): `page.created` wins over `page.updated` (a
 * created-then-updated burst is still reported as `page.created`); for each internal column id
 * present in either payload's `valueChanges`, the earliest `previous` and latest `new` are kept;
 * a column is dropped entirely once its merged `previous`/`new` become deeply equal (a net
 * no-op edit). Actors never merge — the dedupe key already partitions by actor, so `existing`
 * and `incoming` always share the same actor.
 */
export function mergeWebhookDispatchPayload(
  existing: WebhookDispatchPayloadV1,
  incoming: WebhookDispatchPayloadV1
): WebhookDispatchPayloadV1 {
  const event =
    existing.event === 'page.created' || incoming.event === 'page.created' ? 'page.created' : 'page.updated';

  const merged: ValueChangeInput = {};
  const keys = new Set([...Object.keys(existing.valueChanges ?? {}), ...Object.keys(incoming.valueChanges ?? {})]);

  for (const key of keys) {
    const existingChange = existing.valueChanges?.[key];
    const incomingChange = incoming.valueChanges?.[key];

    // Earliest `previous`: prefer the already-queued payload's if it has this key, otherwise the
    // incoming one's (first time this column appears in the burst). Latest `new`: prefer the
    // incoming payload's if it has this key (most recent value), otherwise keep the existing one's.
    const previous = existingChange ? existingChange.previous : (incomingChange?.previous ?? null);
    const next = incomingChange ? incomingChange.new : (existingChange?.new ?? null);

    if (deepEqual(previous, next)) {
      continue;
    }
    merged[key] = { previous, new: next };
  }

  const result: WebhookDispatchPayloadV1 = {
    workspaceId: existing.workspaceId,
    containerId: existing.containerId,
    event,
    actor: existing.actor,
  };
  if (Object.keys(merged).length > 0) {
    result.valueChanges = merged;
  }
  return result;
}

export const webhookDispatchCoalescePolicy: JobCoalescePolicy<WebhookDispatchPayloadV1> = {
  debounceMs: TRAILING_DEBOUNCE_MS,
  maxDebounceMs: MAX_DEBOUNCE_MS,
  merge: mergeWebhookDispatchPayload,
};

/**
 * `webhook.dispatch` — the externally-reachable job submitted by `apps/web`'s page-mutation
 * routes (THOTH-061). Loads the *current* page/data-source snapshot and current enabled
 * webhooks/Apps/grants (never trusting a caller-supplied snapshot — the payload deliberately
 * excludes all of that), then fans out into one `webhook.deliver` child per matched webhook,
 * each carrying a freshly created (or crash-recovered) `pending` delivery row. Completes
 * immediately once fan-out is done; per-destination retry/backoff lives entirely in
 * `webhook.deliver`.
 */
export const webhookDispatchJobDefinition: JobDefinition<WebhookDispatchPayloadV1> = {
  type: 'webhook.dispatch',
  payloadVersion: 1,
  payloadSchema: webhookDispatchPayloadV1Schema,
  priority: 20,
  maxAttempts: DISPATCH_MAX_ATTEMPTS,
  dedupeKey: webhookDispatchDedupeKey,
  coalesce: webhookDispatchCoalescePolicy,
  handler: async (context: JobExecutionContext<WebhookDispatchPayloadV1>) => {
    const { payload } = context;

    const containerRepository = await getContainerRepository();
    const container = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', payload.containerId).eq('workspaceId', payload.workspaceId)
    );

    // Page deleted/moved out of the workspace before dispatch executed — safe no-op.
    if (!container || container.type !== 'page') {
      return { skipped: 'container-missing-or-not-a-page' };
    }

    const dataSource = await resolveDataSourceParent(container);
    const webhooks = await resolveWebhooksToNotify(container, payload.workspaceId, payload.actor, dataSource);

    if (webhooks.length === 0) {
      return { matched: 0 };
    }

    const actorAsWebhookActor = payload.actor;
    let enqueuedCount = 0;

    for (const webhook of webhooks) {
      // Crash-recovery: a repeated dispatch (e.g. after a jobs-process restart mid-fan-out) must
      // find the already-created delivery row for this (sourceJobId, webhookId) pair before
      // generating a new payload/child, never duplicating either.
      let delivery = await findDeliveryBySourceJobAndWebhook(context.jobId, webhook.id);

      if (!delivery) {
        // `buildPayload` needs a `deliveryId` up front, but the repository only assigns the real
        // id on `create` (it doesn't accept a caller-supplied id) — build with a placeholder,
        // then correct the stored payload's `deliveryId` to match the row's actual id so the
        // transmitted/stored payload always correlates with the delivery row (THOTH-061).
        const placeholderId = randomUUID();
        const builtPayload = await buildPayload(
          payload.event,
          placeholderId,
          payload.workspaceId,
          webhook.appId,
          container,
          dataSource,
          payload.valueChanges
        );
        delivery = await createPendingDelivery({
          webhookId: webhook.id,
          appId: webhook.appId,
          event: payload.event,
          containerId: container.id,
          payload: builtPayload,
          sourceJobId: context.jobId,
        });

        if (delivery.payload.deliveryId !== delivery.id) {
          const webhookDeliveryRepository = await getWebhookDeliveryRepository();
          delivery = await webhookDeliveryRepository.update({
            ...delivery,
            payload: { ...delivery.payload, deliveryId: delivery.id },
          });
        }
      }

      if (['success', 'failed', 'cancelled'].includes(delivery.status)) {
        // Already terminal (a resumed dispatch found a delivery that already completed) — never
        // send again.
        continue;
      }

      if (!webhook.enabled) {
        await completeDelivery(delivery.id, { status: 'cancelled' });
        continue;
      }

      // Idempotent per delivery row: `delivery:<deliveryId>` is the logical identity of this
      // child job. Re-running dispatch after the delivery row exists but before the child was
      // enqueued (a crash between the two writes) must enqueue exactly the missing child, never
      // a duplicate — the in-process dedupe key below plus the delivery's own terminal-status
      // check above together guarantee that.
      await context.enqueueChild({
        type: 'webhook.deliver',
        payloadVersion: 1,
        payload: { deliveryId: delivery.id },
        dedupeKey: `delivery:${delivery.id}`,
      });
      enqueuedCount += 1;
    }

    return { matched: webhooks.length, enqueued: enqueuedCount, actor: actorAsWebhookActor.type };
  },
};
