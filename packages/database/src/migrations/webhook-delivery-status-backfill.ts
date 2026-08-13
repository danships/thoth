import type { SuperSave } from 'supersave';
import * as entities from '../entities/index.js';
import type { WebhookDelivery } from '../types.js';

/**
 * One-time backfill for THOTH-061 ("Move webhook delivery to the job service"): normalizes
 * pre-existing `webhook-delivery` rows (all created as one-shot `success`/`failed` attempts
 * before this ticket) onto the expanded status/lifecycle model. `sourceJobId`/`nextAttemptAt`
 * default to `null` (these rows predate the jobs-service dispatch flow entirely), and
 * `completedAt` is backfilled from the existing `lastAttemptAt` since every legacy row is
 * already terminal — `status` (`success`/`failed`) and `payload` are left untouched. Idempotent:
 * skips rows that already have a non-undefined `completedAt`.
 *
 * Uses `superSave.getRepository` directly (runs inside `runMigrations()`; awaiting the cached
 * `getDatabase()` promise here would deadlock).
 */
export async function backfillWebhookDeliveryStatus(superSave: SuperSave): Promise<void> {
  const webhookDeliveryRepository = superSave.getRepository<WebhookDelivery>(entities.WEBHOOK_DELIVERY_NAME);
  const deliveries = await webhookDeliveryRepository.getByQuery(webhookDeliveryRepository.createQuery());

  for (const delivery of deliveries) {
    if (delivery.completedAt !== undefined) {
      continue;
    }

    await webhookDeliveryRepository.update({
      ...delivery,
      sourceJobId: delivery.sourceJobId ?? null,
      nextAttemptAt: delivery.nextAttemptAt ?? null,
      completedAt: delivery.lastAttemptAt ?? null,
    });
  }
}
