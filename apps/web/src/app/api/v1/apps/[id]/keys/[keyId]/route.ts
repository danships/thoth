import { apiRoute } from '@/lib/api/route-wrapper';
import { getApiKeyRepository } from '@/lib/database';
import { appRetriever } from '@/lib/database/retrievers/app-retriever';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { RevokeApiKeyParameters } from '@/types/api';
import { revokeApiKeyParametersSchema } from '@/types/api';

export const DELETE = apiRoute<void, undefined, RevokeApiKeyParameters, {}>(
  {
    disallowApiKey: true,
    expectedParamsSchema: revokeApiKeyParametersSchema,
  },
  async ({ params }, session) => {
    // Ownership enforced through the parent App — this also implicitly confirms the key
    // belongs to a workspace the caller is a member of.
    const app = await appRetriever.retrieveApp(params.id, session.user.id);

    const apiKeyRepository = await getApiKeyRepository();
    const existingKey = await apiKeyRepository.getOneByQuery(
      apiKeyRepository.createQuery().eq('id', params.keyId).eq('appId', app.id)
    );

    if (!existingKey) {
      throw new NotFoundError('Key not found');
    }

    if (!existingKey.revokedAt) {
      await apiKeyRepository.update({ ...existingKey, revokedAt: new Date().toISOString() });
    }
  }
);
