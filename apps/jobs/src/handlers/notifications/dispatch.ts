import {
  createNotification,
  findNotificationBySourceJobAndRecipient,
  getContainerRepository,
  getWorkspaceRepository,
  renderActorLabel,
  renderNotificationTitleBody,
  resolveNotificationRecipients,
} from '@thoth/database';
import {
  notificationDispatchPayloadV1Schema,
  type JobCoalescePolicy,
  type JobDefinition,
  type JobExecutionContext,
  type NotificationDispatchPayloadV1,
} from '@thoth/job-protocol';

const TRAILING_DEBOUNCE_MS = 30_000;
const MAX_DEBOUNCE_MS = 300_000;
const DISPATCH_MAX_ATTEMPTS = 1; // Best-effort orchestration; a failed recipient loop iteration doesn't retry the whole burst.

// Bound on how many ancestors are walked to build the current live ancestor chain — well beyond
// any realistic page nesting depth, purely a defensive circuit-breaker against a corrupted
// `parentId` cycle.
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
  const event = existing.event === 'page.created' || incoming.event === 'page.created' ? 'page.created' : 'page.updated';
  const occurredAt = existing.occurredAt > incoming.occurredAt ? existing.occurredAt : incoming.occurredAt;

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
 * Resolves the *current* live ancestor chain of `container` by walking `parentId`, nearest-first
 * — so a page moved between when this dispatch was queued and when it executes is evaluated
 * against its new ancestry (THOTH-066 spec, "Moved page → ancestor rebuild"). Stops at the first
 * missing/root parent, or after `MAX_ANCESTOR_WALK` hops as a defensive circuit-breaker.
 */
async function resolveLiveAncestorIds(
  workspaceId: string,
  startParentId: string | null
): Promise<string[]> {
  const containerRepository = await getContainerRepository();
  const ancestorIds: string[] = [];
  let currentParentId = startParentId;

  while (currentParentId && ancestorIds.length < MAX_ANCESTOR_WALK) {
    const parent = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', currentParentId).eq('workspaceId', workspaceId)
    );
    if (!parent) {
      break;
    }
    ancestorIds.push(parent.id);
    currentParentId = parent.parentId;
  }

  return ancestorIds;
}

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
    if (!container || container.type !== 'page') {
      return { skipped: 'container-missing-or-not-a-page' };
    }

    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(
      workspaceRepository.createQuery().eq('id', payload.workspaceId)
    );
    if (!workspace) {
      return { skipped: 'workspace-missing' };
    }

    const ancestorIds = await resolveLiveAncestorIds(payload.workspaceId, container.parentId);

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
    for (const userId of recipients) {
      // Crash-recovery: a repeated dispatch (e.g. after a jobs-process restart mid-fan-out)
      // must find the already-created inbox item for this (sourceJobId, userId) pair before
      // creating a new one, never duplicating it (mirrors `findDeliveryBySourceJobAndWebhook`).
      const existing = await findNotificationBySourceJobAndRecipient(context.jobId, userId);
      if (existing) {
        continue;
      }

      await createNotification({
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
      });
      created += 1;
    }

    // --- THOTH-071 extension seam: mute/quiet-schedule evaluation, push-subscription lookup,
    // `notification-delivery` row creation, and `notification.deliver` child enqueue go here. ---

    return { recipients: recipients.length, created };
  },
};
