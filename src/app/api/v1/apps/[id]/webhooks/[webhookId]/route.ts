import { apiRoute } from '@/lib/api/route-wrapper';
import { getWebhookRepository } from '@/lib/database';
import { deleteWebhook, generateWebhookSecret, maskWebhookSecret } from '@/lib/database/webhook-service';
import { assertPublicHttpsUrl } from '@/lib/webhooks/ssrf';
import { appRetriever } from '@/lib/database/retrievers/app-retriever';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { UpdateWebhookBody, UpdateWebhookResponse, WebhookDetailParameters, WebhookResponse } from '@/types/api';
import { updateWebhookBodySchema, webhookDetailParametersSchema } from '@/types/api';
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

async function retrieveWebhookForApp(appId: string, webhookId: string): Promise<Webhook> {
  const webhookRepository = await getWebhookRepository();
  const webhook = await webhookRepository.getOneByQuery(
    webhookRepository.createQuery().eq('id', webhookId).eq('appId', appId)
  );
  if (!webhook) {
    throw new NotFoundError('Webhook not found');
  }
  return webhook;
}

export const GET = apiRoute<WebhookResponse, {}, WebhookDetailParameters, {}>(
  {
    disallowApiKey: true,
    expectedParamsSchema: webhookDetailParametersSchema,
  },
  async ({ params }, session) => {
    const app = await appRetriever.retrieveApp(params.id, session.user.id);
    const webhook = await retrieveWebhookForApp(app.id, params.webhookId);
    return toResponse(webhook);
  }
);

export const PATCH = apiRoute<UpdateWebhookResponse, undefined, WebhookDetailParameters, UpdateWebhookBody>(
  {
    disallowApiKey: true,
    expectedParamsSchema: webhookDetailParametersSchema,
    expectedBodySchema: updateWebhookBodySchema,
  },
  async ({ params, body }, session) => {
    const app = await appRetriever.retrieveApp(params.id, session.user.id);
    const existingWebhook = await retrieveWebhookForApp(app.id, params.webhookId);

    if (body.url && body.url !== existingWebhook.url) {
      await assertPublicHttpsUrl(body.url);
    }

    const rotatedSecret = body.rotateSecret ? generateWebhookSecret() : undefined;

    const webhookRepository = await getWebhookRepository();
    const updated = await webhookRepository.update({
      ...existingWebhook,
      label: body.label?.trim() ?? existingWebhook.label,
      url: body.url ?? existingWebhook.url,
      enabled: body.enabled ?? existingWebhook.enabled,
      suppressOwnChanges: body.suppressOwnChanges ?? existingWebhook.suppressOwnChanges,
      secret: rotatedSecret ?? existingWebhook.secret,
      lastUpdated: new Date().toISOString(),
    });

    return {
      ...toResponse(updated),
      ...(rotatedSecret && { secret: rotatedSecret }),
    };
  }
);

export const DELETE = apiRoute<void, undefined, WebhookDetailParameters, {}>(
  {
    disallowApiKey: true,
    expectedParamsSchema: webhookDetailParametersSchema,
  },
  async ({ params }, session) => {
    const app = await appRetriever.retrieveApp(params.id, session.user.id);
    const webhook = await retrieveWebhookForApp(app.id, params.webhookId);
    await deleteWebhook(webhook.id);
  }
);
