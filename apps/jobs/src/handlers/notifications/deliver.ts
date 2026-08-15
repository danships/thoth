import { z } from 'zod';
import webpush from 'web-push';
import {
  cancelSiblingDeliveriesForSubscription,
  completeNotificationDelivery,
  disablePushSubscriptionById,
  getNotificationDeliveryRepository,
  getNotificationRepository,
  getPushSubscriptionRepository,
  recordNotificationDeliveryAttempt,
  TERMINAL_NOTIFICATION_DELIVERY_STATUSES,
} from '@thoth/database';
import { RetryableJobError, type JobDefinition, type JobExecutionContext } from '@thoth/job-protocol';
import { getEnvironment } from '../../environment.js';
import { computeBackoffMs } from '../../runner/backoff.js';
import { parseRetryAfterMs } from '../webhooks/backoff.js';
import { getVapidKeys } from '../../notifications/vapid.js';
import { getLogger } from '../../logger.js';
import { assertPublicHttpsUrl } from '../webhooks/ssrf.js';

/**
 * `notification.deliver` — internal child job created per-device by the extended
 * `notification.dispatch` handler (THOTH-071). NOT part of `packages/job-protocol`'s external
 * schema — only reachable via `enqueueChild` from within another jobs-side handler.
 *
 * Mirrors `webhook.deliver`'s structure closely: reload the delivery row on every attempt,
 * skip if already terminal, classify the outcome (2xx → sent; network/timeout/408/425/429/5xx
 * → retryable via `RetryableJobError`; 404/410 → disable subscription + expire this delivery
 * + cancel siblings; other 4xx → terminal failed).
 */
export const notificationDeliverPayloadSchema = z.object({ deliveryId: z.string().min(1) }).strict();
export type NotificationDeliverPayload = z.infer<typeof notificationDeliverPayloadSchema>;

const MAX_ATTEMPTS = 5;
const RETRYABLE_STATUSES = new Set([408, 425, 429]);

function isRetryableStatus(status: number): boolean {
  return status >= 500 || RETRYABLE_STATUSES.has(status);
}

function sanitizeErrorCode(message: string): string {
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}

export const notificationDeliverJobDefinition: JobDefinition<NotificationDeliverPayload> = {
  type: 'notification.deliver',
  payloadVersion: 1,
  payloadSchema: notificationDeliverPayloadSchema,
  priority: 10,
  maxAttempts: MAX_ATTEMPTS,
  handler: async (context: JobExecutionContext<NotificationDeliverPayload>) => {
    const logger = getLogger();
    const deliveryRepository = await getNotificationDeliveryRepository();
    const delivery = await deliveryRepository.getById(context.payload.deliveryId);
    if (!delivery) return { skipped: 'delivery-not-found' };
    if (TERMINAL_NOTIFICATION_DELIVERY_STATUSES.includes(delivery.status)) {
      return { skipped: 'already-terminal', status: delivery.status };
    }

    const subscriptionRepository = await getPushSubscriptionRepository();
    const subscription = await subscriptionRepository.getById(delivery.pushSubscriptionId);
    if (!subscription || subscription.disabledAt !== null) {
      await completeNotificationDelivery(delivery.id, { status: 'cancelled' });
      return { cancelled: 'subscription-missing-or-disabled' };
    }
    if (subscription.expirationTime !== null && subscription.expirationTime <= Date.now()) {
      await completeNotificationDelivery(delivery.id, { status: 'expired' });
      return { expired: 'subscription-expired' };
    }

    const notificationRepository = await getNotificationRepository();
    const notification = await notificationRepository.getById(delivery.notificationId);
    if (!notification) {
      await completeNotificationDelivery(delivery.id, { status: 'cancelled' });
      return { cancelled: 'notification-missing' };
    }

    const vapid = getVapidKeys();
    if (!vapid) {
      // Web Push disabled at runtime (or misconfigured VAPID) — treat as cancelled rather than
      // holding pending rows forever.
      await completeNotificationDelivery(delivery.id, { status: 'cancelled', errorCode: 'push-disabled' });
      return { cancelled: 'push-disabled' };
    }

    const environment = getEnvironment();
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      tag: notification.id,
      notificationId: notification.id,
      openPath: `/notifications/${notification.id}/open`,
    });

    // Delivery-time SSRF guard (THOTH-071 review fix): `web-push` hands `subscription.endpoint`
    // straight to `https.request`, so a stored endpoint resolving to a private/loopback/
    // link-local address (e.g. cloud metadata) could make this process connect internally.
    // Reject before ever calling `webpush.sendNotification` — same guard `apps/jobs`'s webhook
    // delivery already applies to webhook URLs, re-resolved on every attempt (defends against
    // DNS rebinding, not just a bad value at registration time). A subscription that fails this
    // can never succeed, so it's a terminal failure, not a retry.
    try {
      await assertPublicHttpsUrl(subscription.endpoint);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('notification.deliver.endpoint-rejected', {
        deliveryId: delivery.id,
        pushSubscriptionId: delivery.pushSubscriptionId,
        // Never log the endpoint itself — only the guard's reason.
        reason: message,
      });
      await completeNotificationDelivery(delivery.id, {
        status: 'failed',
        errorCode: sanitizeErrorCode(`endpoint-rejected: ${message}`),
      });
      return { status: 'failed', reason: 'endpoint-not-public' };
    }

    try {
      const result = await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        },
        payload,
        {
          vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
          TTL: environment.WEB_PUSH_DELIVERY_TTL_SECONDS,
          timeout: environment.WEB_PUSH_DELIVERY_TIMEOUT_MS,
        }
      );
      await completeNotificationDelivery(delivery.id, {
        status: 'sent',
        httpStatus: result.statusCode ?? null,
      });
      return { status: 'sent' };
    } catch (error: unknown) {
      const status =
        typeof (error as { statusCode?: unknown }).statusCode === 'number'
          ? ((error as { statusCode: number }).statusCode)
          : null;
      const headers = (error as { headers?: Record<string, string> }).headers ?? {};
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('notification.deliver.error', {
        deliveryId: delivery.id,
        pushSubscriptionId: delivery.pushSubscriptionId,
        httpStatus: status,
        // Never log endpoint/keys/payload — id-only diagnostics.
      });

      // 404/410 — subscription is gone; disable, expire this delivery, cancel siblings.
      if (status === 404 || status === 410) {
        await disablePushSubscriptionById(delivery.pushSubscriptionId);
        await completeNotificationDelivery(delivery.id, {
          status: 'expired',
          httpStatus: status,
          errorCode: sanitizeErrorCode(`push-endpoint-gone-${status}`),
        });
        await cancelSiblingDeliveriesForSubscription(delivery.pushSubscriptionId, delivery.id);
        return { status: 'expired', httpStatus: status };
      }

      const retryable = status === null ? true : isRetryableStatus(status);
      if (!retryable) {
        await completeNotificationDelivery(delivery.id, {
          status: 'failed',
          httpStatus: status,
          errorCode: sanitizeErrorCode(message),
        });
        return { status: 'failed', httpStatus: status };
      }

      const exhausted = context.attempt >= context.maxAttempts;
      if (exhausted) {
        await completeNotificationDelivery(delivery.id, {
          status: 'failed',
          httpStatus: status,
          errorCode: sanitizeErrorCode(message),
        });
        return { status: 'failed', exhausted: true, httpStatus: status };
      }

      const retryAfterMs =
        parseRetryAfterMs(headers['retry-after'] ?? null, context.now) ??
        computeBackoffMs(context.attempt, { baseMs: environment.WEB_PUSH_DELIVERY_BACKOFF_BASE_MS });
      await recordNotificationDeliveryAttempt(delivery.id, {
        httpStatus: status,
        errorCode: sanitizeErrorCode(message),
      });
      throw new RetryableJobError(sanitizeErrorCode(message), { retryAfterMs });
    }
  },
};
