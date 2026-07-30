import { apiRoute } from '@/lib/api/route-wrapper';
import { appRetriever } from '@/lib/database/retrievers/app-retriever';
import { resendDelivery } from '@/lib/webhooks/resend-delivery';
import { toDeliveryResponse } from '@/lib/database/webhook-service';
import { ConflictError } from '@/lib/errors/conflict-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { ResendWebhookDeliveryParameters, ResendWebhookDeliveryResponse } from '@/types/api';
import { resendWebhookDeliveryParametersSchema } from '@/types/api';

export const POST = apiRoute<ResendWebhookDeliveryResponse, undefined, ResendWebhookDeliveryParameters, {}>(
  {
    disallowApiKey: true,
    expectedParamsSchema: resendWebhookDeliveryParametersSchema,
  },
  async ({ params }, session) => {
    const app = await appRetriever.retrieveApp(params.id, session.user.id);

    const result = await resendDelivery(app.id, params.webhookId, params.deliveryId);
    if (!result) {
      throw new NotFoundError('Delivery not found');
    }

    if (result.webhookDisabled) {
      throw new ConflictError('Webhook is disabled');
    }

    const { delivery } = result;
    return toDeliveryResponse(delivery);
  }
);
