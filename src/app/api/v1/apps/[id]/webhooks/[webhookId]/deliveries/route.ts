import { apiRoute } from '@/lib/api/route-wrapper';
import { getWebhookDeliveryRepository, getWebhookRepository } from '@/lib/database';
import { appRetriever } from '@/lib/database/retrievers/app-retriever';
import { MAX_DELIVERIES_PER_WEBHOOK, toDeliveryResponse } from '@/lib/database/webhook-service';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { GetWebhookDeliveriesResponse, WebhookDeliveriesParameters } from '@/types/api';
import { webhookDeliveriesParametersSchema } from '@/types/api';

export const GET = apiRoute<GetWebhookDeliveriesResponse, {}, WebhookDeliveriesParameters, {}>(
  {
    disallowApiKey: true,
    expectedParamsSchema: webhookDeliveriesParametersSchema,
  },
  async ({ params }, session) => {
    const app = await appRetriever.retrieveApp(params.id, session.user.id);

    const webhookRepository = await getWebhookRepository();
    const webhook = await webhookRepository.getOneByQuery(
      webhookRepository.createQuery().eq('id', params.webhookId).eq('appId', app.id)
    );
    if (!webhook) {
      throw new NotFoundError('Webhook not found');
    }

    const webhookDeliveryRepository = await getWebhookDeliveryRepository();
    const deliveries = await webhookDeliveryRepository.getByQuery(
      webhookDeliveryRepository
        .createQuery()
        .eq('webhookId', webhook.id)
        .sort('createdAt', 'desc')
        .limit(MAX_DELIVERIES_PER_WEBHOOK)
    );

    return {
      deliveries: deliveries.map((delivery) => toDeliveryResponse(delivery)),
    };
  }
);
