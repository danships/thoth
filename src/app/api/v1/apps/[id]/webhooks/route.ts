import { apiRoute } from '@/lib/api/route-wrapper';
import { getWebhookRepository } from '@/lib/database';
import { generateWebhookSecret, listWebhooksForApp, maskWebhookSecret } from '@/lib/database/webhook-service';
import { assertPublicHttpsUrl } from '@/lib/webhooks/ssrf';
import { appRetriever } from '@/lib/database/retrievers/app-retriever';
import type {
  CreateWebhookBody,
  CreateWebhookResponse,
  GetWebhooksResponse,
  WebhookParameters,
  WebhookResponse,
} from '@/types/api';
import { createWebhookBodySchema, webhookParametersSchema } from '@/types/api';
import type { Webhook } from '@/types/database';

function toResponse(webhook: Webhook): WebhookResponse {
  return {
    id: webhook.id,
    appId: webhook.appId,
    workspaceId: webhook.workspaceId,
    label: webhook.label,
    url: webhook.url,
    enabled: webhook.enabled,
    suppressOwnChanges: webhook.suppressOwnChanges,
    secretMasked: maskWebhookSecret(webhook.secret),
    createdAt: webhook.createdAt,
    lastUpdated: webhook.lastUpdated,
  };
}

export const GET = apiRoute<GetWebhooksResponse, {}, WebhookParameters, {}>(
  {
    disallowApiKey: true,
    expectedParamsSchema: webhookParametersSchema,
  },
  async ({ params }, session) => {
    const app = await appRetriever.retrieveApp(params.id, session.user.id);
    const webhooks = await listWebhooksForApp(app.id);

    return {
      webhooks: webhooks.map((webhook) => toResponse(webhook)),
    };
  }
);

export const POST = apiRoute<CreateWebhookResponse, {}, WebhookParameters, CreateWebhookBody>(
  {
    disallowApiKey: true,
    expectedParamsSchema: webhookParametersSchema,
    expectedBodySchema: createWebhookBodySchema,
  },
  async ({ params, body }, session) => {
    const app = await appRetriever.retrieveApp(params.id, session.user.id);

    await assertPublicHttpsUrl(body.url);

    const secret = generateWebhookSecret();

    const webhookRepository = await getWebhookRepository();
    const created = await webhookRepository.create({
      appId: app.id,
      workspaceId: app.workspaceId,
      label: body.label.trim(),
      url: body.url,
      secret,
      enabled: body.enabled ?? true,
      suppressOwnChanges: body.suppressOwnChanges ?? false,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });

    return {
      ...toResponse(created),
      secret,
    };
  }
);
