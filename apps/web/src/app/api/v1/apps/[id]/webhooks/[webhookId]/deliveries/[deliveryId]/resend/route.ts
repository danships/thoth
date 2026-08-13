import { randomUUID } from 'node:crypto';
import { enqueueJob, JobClientError } from '@thoth/job-protocol';
import { apiRoute } from '@/lib/api/route-wrapper';
import { getWebhookDeliveryRepository, getWebhookRepository } from '@/lib/database';
import { appRetriever } from '@/lib/database/retrievers/app-retriever';
import { toDeliveryResponse } from '@/lib/database/webhook-service';
import { ConflictError } from '@/lib/errors/conflict-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { ServiceUnavailableError } from '@/lib/errors/service-unavailable-error';
import type { ResendWebhookDeliveryParameters, ResendWebhookDeliveryResponse } from '@/types/api';
import { resendWebhookDeliveryParametersSchema } from '@/types/api';

/**
 * Submits a `webhook.redeliver` job and returns immediately (THOTH-061) — the route never
 * performs an outbound fetch itself. Ownership (App -> webhook -> delivery) and the
 * disabled/already-active conflicts are checked here (session-only, before any job is
 * enqueued); the jobs process is trusted to reload current webhook state again before actually
 * delivering. A `503` means nothing was accepted (the delivery row keeps its prior state); a
 * `202` guarantees the job service durably acknowledged the request.
 */
export const POST = apiRoute<ResendWebhookDeliveryResponse, undefined, ResendWebhookDeliveryParameters, {}>(
  {
    disallowApiKey: true,
    expectedParamsSchema: resendWebhookDeliveryParametersSchema,
  },
  async ({ params, setResponseStatus }, session) => {
    const app = await appRetriever.retrieveApp(params.id, session.user.id);

    const webhookRepository = await getWebhookRepository();
    const webhook = await webhookRepository.getOneByQuery(
      webhookRepository.createQuery().eq('id', params.webhookId).eq('appId', app.id)
    );
    if (!webhook) {
      throw new NotFoundError('Webhook not found');
    }

    const webhookDeliveryRepository = await getWebhookDeliveryRepository();
    const delivery = await webhookDeliveryRepository.getOneByQuery(
      webhookDeliveryRepository
        .createQuery()
        .eq('id', params.deliveryId)
        .eq('webhookId', webhook.id)
        .eq('appId', app.id)
    );
    if (!delivery) {
      throw new NotFoundError('Delivery not found');
    }

    if (!webhook.enabled) {
      throw new ConflictError('Webhook is disabled');
    }

    if (delivery.status === 'pending' || delivery.status === 'retrying') {
      throw new ConflictError('Delivery is already pending or retrying');
    }

    const socketPath = process.env['JOB_SOCKET_PATH'];
    if (!socketPath) {
      throw new ServiceUnavailableError('Job service is not available');
    }

    let jobId: string;
    try {
      const response = await enqueueJob(
        {
          type: 'webhook.redeliver',
          payloadVersion: 1,
          payload: { deliveryId: delivery.id, idempotencyToken: randomUUID() },
        },
        { socketPath }
      );
      if (!response.ok || !response.result.jobId) {
        throw new JobClientError('SERVER_ERROR', response.ok ? 'Missing jobId' : response.error.message, false);
      }
      jobId = response.result.jobId;
    } catch {
      throw new ServiceUnavailableError('Job service did not acknowledge the resend request');
    }

    setResponseStatus(202);
    return {
      jobId,
      delivery: toDeliveryResponse(delivery),
    };
  }
);
