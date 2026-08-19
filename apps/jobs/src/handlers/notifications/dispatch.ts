import {
  createNotification,
  createOrReuseNotificationDelivery,
  findNotificationBySourceJobAndRecipient,
  getContainerRepository,
  getWorkspaceRepository,
  isNotificationMutedAt,
  listActivePushSubscriptionsForUser,
  recomputeParentNotificationSummary,
  renderActorLabel,
  renderNotificationTitleBody,
  resolveLiveAncestorIdsBridgingDataSources,
  resolveNotificationRecipients,
  setNotificationPushSummary,
} from '@thoth/database';
import {
  notificationDispatchPayloadV1Schema,
  type JobCoalescePolicy,
  type JobDefinition,
  type JobExecutionContext,
  type NotificationDispatchPayloadV1,
} from '@thoth/job-protocol';
import { getEnvironment } from '../../environment.js';
import { getLogger } from '../../logger.js';
import { readNotificationMuteSettingsForUser } from '../../notifications/settings.js';

const TRAILING_DEBOUNCE_MS = 30_000;
const MAX_DEBOUNCE_MS = 300_000;
const DISPATCH_MAX_ATTEMPTS = 1; // Best-effort orchestration; a failed recipient loop iteration doesn't retry the whole burst.

// Bound on the total live ancestors collected for notification rule matching, including hosts
// reached through embedded data sources.
const MAX_ANCESTOR_WALK = 200;

/** Derived active-dedupe key (THOTH-066 spec): `notification:<workspaceId>:<containerId>:<actor.type>:<actor id>`. */
export function notificationDispatchDedupeKey(payload: NotificationDispatchPayloadV1): string {
  const actorId = payload.actor.type === 'user' ? payload.actor.userId : payload.actor.appId;
  return `notification:${payload.workspaceId}:${payload.containerId}:${payload.actor.type}:${actorId}`;
}

/**
 * Merges a newly-arriving `notification.dispatch` payload into an already-queued one sharing
 * the same dedupe key (THOTH-066 merge rules): `page.created` wins over `page.updated` (a
 * created-then-updated burst is still reported as `page.created`), `changeCount` is summed, and
 * `occurredAt` keeps the latest timestamp. Actors never merge — the dedupe key already
 * partitions by actor, so `existing`/`incoming` always share the same actor.
 */
export function mergeNotificationDispatchPayload(
  existing: NotificationDispatchPayloadV1,
  incoming: NotificationDispatchPayloadV1
): NotificationDispatchPayloadV1 {
  const event =
    existing.event === 'page.created' || incoming.event === 'page.created' ? 'page.created' : 'page.updated';
  const occurredAt =
    Date.parse(existing.occurredAt) > Date.parse(incoming.occurredAt) ? existing.occurredAt : incoming.occurredAt;

  return {
    workspaceId: existing.workspaceId,
    containerId: existing.containerId,
    event,
    actor: existing.actor,
    changeCount: existing.changeCount + incoming.changeCount,
    occurredAt,
  };
}

export const notificationDispatchCoalescePolicy: JobCoalescePolicy<NotificationDispatchPayloadV1> = {
  debounceMs: TRAILING_DEBOUNCE_MS,
  maxDebounceMs: MAX_DEBOUNCE_MS,
  merge: mergeNotificationDispatchPayload,
};

/**
 * `notification.dispatch` — the externally-reachable job submitted by `apps/web`'s
 * page-mutation routes (THOTH-066), alongside the existing `webhook.dispatch`. Reloads the
 * *current* page/ancestor-chain/rule/membership state itself (the payload deliberately excludes
 * all of that — see the THOTH-066 spec), resolves the surviving recipient set, and creates one
 * immutable inbox item per recipient, idempotently keyed by `(sourceJobId, userId)`.
 *
 * THOTH-071 EXTENSION SEAM: this handler intentionally stops once every matching recipient's
 * inbox item has been created. THOTH-071 will continue from the end of the recipient loop below
 * — evaluating mute/quiet schedules, loading `push-subscription` rows, creating
 * `notification-delivery` rows, and enqueueing `notification.deliver` child jobs. THOTH-066
 * creates no delivery rows and no child jobs.
 */
export const notificationDispatchJobDefinition: JobDefinition<NotificationDispatchPayloadV1> = {
  type: 'notification.dispatch',
  payloadVersion: 1,
  payloadSchema: notificationDispatchPayloadV1Schema,
  priority: 20,
  maxAttempts: DISPATCH_MAX_ATTEMPTS,
  dedupeKey: notificationDispatchDedupeKey,
  coalesce: notificationDispatchCoalescePolicy,
  handler: async (context: JobExecutionContext<NotificationDispatchPayloadV1>) => {
    const { payload } = context;

    const containerRepository = await getContainerRepository();
    const container = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', payload.containerId).eq('workspaceId', payload.workspaceId)
    );

    // Page deleted/moved out of the workspace before dispatch executed — safe no-op.
    if (!container || container.type !== 'page' || container.deletedAt) {
      return { skipped: 'container-missing-or-not-a-page' };
    }

    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(
      workspaceRepository.createQuery().eq('id', payload.workspaceId)
    );
    if (!workspace) {
      return { skipped: 'workspace-missing' };
    }

    const ancestorIds = await resolveLiveAncestorIdsBridgingDataSources({
      workspaceId: payload.workspaceId,
      container: { id: container.id, type: container.type, parentId: container.parentId },
      maxAncestors: MAX_ANCESTOR_WALK,
    });

    const recipients = await resolveNotificationRecipients({
      workspaceId: payload.workspaceId,
      container: { id: container.id, workspaceId: payload.workspaceId },
      ancestorIds,
      actor: payload.actor,
    });

    if (recipients.length === 0) {
      return { recipients: 0 };
    }

    // Actor label falls back to a neutral one if the acting user/App can't be resolved by name
    // (THOTH-066 edge case: "Actor left / label fallback") — rendered strings are frozen at
    // creation, so this fallback only ever affects notifications created after the actor's
    // record is gone, never rewrites existing history.
    const actorLabel = renderActorLabel(payload.actor, {});
    const { title, body } = renderNotificationTitleBody({
      pageName: container.name,
      workspaceName: workspace.name,
      actorLabel,
      event: payload.event,
      changeCount: payload.changeCount,
    });

    let created = 0;
    // Read env once, but never fail dispatch (or a test) because of an incomplete env — the
    // handler must remain functional as a THOTH-066 inbox creator even if push env vars are
    // missing/invalid.
    let pushEnabled = false;
    try {
      pushEnabled = getEnvironment().WEB_PUSH_ENABLED;
    } catch {
      pushEnabled = false;
    }
    const logger = pushEnabled ? getLogger() : undefined;
    for (const userId of recipients) {
      // Crash-recovery: a repeated dispatch (e.g. after a jobs-process restart mid-fan-out)
      // must find the already-created inbox item for this (sourceJobId, userId) pair before
      // creating a new one, never duplicating it (mirrors `findDeliveryBySourceJobAndWebhook`).
      const existing = await findNotificationBySourceJobAndRecipient(context.jobId, userId);
      const notificationRow =
        existing ??
        (await createNotification({
          userId,
          workspaceId: payload.workspaceId,
          containerId: container.id,
          event: payload.event,
          actor: payload.actor,
          title,
          body,
          changeCount: payload.changeCount,
          sourceJobId: context.jobId,
          occurredAt: payload.occurredAt,
        }));
      if (!existing) created += 1;

      // --- THOTH-071 push extension. Wrapped in try/catch so a push-side failure NEVER
      //     rolls back the already-created inbox item (which was the entire THOTH-066
      //     durability contract). ---
      if (!pushEnabled) continue;
      try {
        let muted = false;
        try {
          const settings = await readNotificationMuteSettingsForUser(userId);
          const evaluation = isNotificationMutedAt(settings, new Date());
          muted = evaluation.muted;
        } catch (evaluationError) {
          // Fail-open-to-push: malformed persisted settings → push proceeds.
          logger?.warn('notification.dispatch.mute-eval-failed', {
            userId,
            notificationId: notificationRow.id,
            error: evaluationError instanceof Error ? evaluationError.message : String(evaluationError),
          });
        }
        if (muted) {
          await setNotificationPushSummary(notificationRow.id, 'muted', 0);
          continue;
        }
        const devices = await listActivePushSubscriptionsForUser(userId);
        if (devices.length === 0) {
          await setNotificationPushSummary(notificationRow.id, 'no_devices', 0);
          continue;
        }
        for (const device of devices) {
          const delivery = await createOrReuseNotificationDelivery({
            notificationId: notificationRow.id,
            pushSubscriptionId: device.id,
          });
          await context.enqueueChild({
            type: 'notification.deliver',
            payloadVersion: 1,
            payload: { deliveryId: delivery.id },
            dedupeKey: `notification-delivery:${delivery.id}`,
          });
        }
        // Recompute (rather than blindly overwrite) so a re-dispatch that finds some deliveries
        // already terminal never regresses `pushSentCount`/`pushFailedCount` or reports a stale
        // 'queued' disposition — see `recomputeParentNotificationSummary`.
        await recomputeParentNotificationSummary(notificationRow.id);
      } catch (pushError) {
        logger?.warn('notification.dispatch.push-fanout-failed', {
          userId,
          notificationId: notificationRow.id,
          error: pushError instanceof Error ? pushError.message : String(pushError),
        });
      }
    }

    // --- End THOTH-071 push extension. ---

    return { recipients: recipients.length, created };
  },
};
