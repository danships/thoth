import { apiRoute } from '@/lib/api/route-wrapper';
import { mutatePageContent } from '@/lib/api/server/mutate-page-content';
import type { MutatePageContentBody, MutatePageContentParameters, MutatePageContentResponse } from '@/types/api';
import { mutatePageContentBodySchema, mutatePageContentParametersSchema } from '@/types/api';

// Prepends `body.content` to the start of the page's existing markdown content. Identical to
// `POST /pages/:id/append` in every respect except resulting order — see that route and
// `mutatePageContent` for the shared auth/scoping/persistence logic.
export const POST = apiRoute<MutatePageContentResponse, undefined, MutatePageContentParameters, MutatePageContentBody>(
  {
    expectedBodySchema: mutatePageContentBodySchema,
    expectedParamsSchema: mutatePageContentParametersSchema,
  },
  async ({ params, body }, session) => mutatePageContent(params.id, session, body.content, 'prepend')
);
