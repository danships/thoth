import { z } from 'zod';

// NOTE: THOTH-032 was originally written against the pre-THOTH-029 BlockNote `blocks` model.
// The codebase has since moved page contents to a plain markdown `content: string` field (see
// `get-page-content.ts` / `set-page-content.ts`), so these endpoints append/prepend markdown
// text instead of concatenating a `Block[]` array. The schema/route/security patterns mirror
// the spec 1:1, just adapted to the current `content` representation.

export const APPEND_PAGE_CONTENT_ENDPOINT = '/pages/:id/append';
export const PREPEND_PAGE_CONTENT_ENDPOINT = '/pages/:id/prepend';

export const mutatePageContentParametersSchema = z.object({
  id: z.string().min(1),
});

export type MutatePageContentParameters = z.infer<typeof mutatePageContentParametersSchema>;

export const mutatePageContentBodySchema = z.object({
  content: z.string().max(1_000_000),
});

export type MutatePageContentBody = z.infer<typeof mutatePageContentBodySchema>;

export const mutatePageContentResponseSchema = z.object({
  content: z.string(),
});

export type MutatePageContentResponse = z.infer<typeof mutatePageContentResponseSchema>;
