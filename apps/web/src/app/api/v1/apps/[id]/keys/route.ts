import { apiRoute } from '@/lib/api/route-wrapper';
import { getApiKeyRepository } from '@/lib/database';
import { generateApiKey } from '@/lib/database/app-service';
import { appRetriever } from '@/lib/database/retrievers/app-retriever';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { ConflictError } from '@/lib/errors/conflict-error';
import type { ApiKeyParameters, CreateApiKeyBody, CreateApiKeyResponse } from '@/types/api';
import { apiKeyParametersSchema, createApiKeyBodySchema } from '@/types/api';

const DEFAULT_KEY_LABEL = 'Key';

export const POST = apiRoute<CreateApiKeyResponse, {}, ApiKeyParameters, CreateApiKeyBody>(
  {
    disallowApiKey: true,
    expectedParamsSchema: apiKeyParametersSchema,
    expectedBodySchema: createApiKeyBodySchema,
  },
  async ({ params, body }, session) => {
    const app = await appRetriever.retrieveApp(params.id, session.user.id);

    if (app.archivedAt) {
      throw new ConflictError('App is archived and cannot mint new keys');
    }

    if (body.expiresAt && body.expiresAt <= new Date().toISOString()) {
      throw new BadRequestError('expiresAt must be in the future');
    }

    const { raw, prefix, hash } = generateApiKey();

    const apiKeyRepository = await getApiKeyRepository();
    const createdKey = await apiKeyRepository.create({
      appId: app.id,
      label: body.label?.trim() || DEFAULT_KEY_LABEL,
      keyPrefix: prefix,
      keyHash: hash,
      expiresAt: body.expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    });

    return {
      id: createdKey.id,
      appId: createdKey.appId,
      label: createdKey.label,
      keyPrefix: createdKey.keyPrefix,
      expiresAt: createdKey.expiresAt,
      lastUsedAt: createdKey.lastUsedAt,
      revokedAt: createdKey.revokedAt,
      createdAt: createdKey.createdAt,
      secret: raw,
    };
  }
);
