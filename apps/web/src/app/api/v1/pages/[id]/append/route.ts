import { apiRoute } from '@/lib/api/route-wrapper';
import { mutatePageContent } from '@/lib/api/server/mutate-page-content';
import type { MutatePageContentBody, MutatePageContentParameters, MutatePageContentResponse } from '@/types/api';
import { mutatePageContentBodySchema, mutatePageContentParametersSchema } from '@/types/api';

// Appends `body.content` to the end of the page's existing markdown content, avoiding the
// race-prone client-side GET -> splice -> PUT round trip. Callable with a cookie session or an
// App API key (`disallowApiKey` intentionally not set) — this is the primary use case for
// automations/integrations. Mutating verb, so a read-only App key is automatically rejected
// (403) by the `apiRoute` wrapper before the handler runs.
export const POST = apiRoute<MutatePageContentResponse, undefined, MutatePageContentParameters, MutatePageContentBody>(
  {
    expectedBodySchema: mutatePageContentBodySchema,
    expectedParamsSchema: mutatePageContentParametersSchema,
  },
  async ({ params, body }, session) => mutatePageContent(params.id, session, body.content, 'append')
);
