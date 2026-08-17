import { z } from 'zod';
import { pageSchema } from '../entities';
import type { DataWrapper } from '../utilities';
import { pageContainerSchema } from '@thoth/database/types';

// Define the endpoint path
export const UPDATE_PAGE_ENDPOINT = '/pages/:id';

// Update page - allow updating name, emoji, cover, and privacy.
//
// `isPrivate` is re-declared here (rather than relying on `.pick(...).partial()` alone) because
// `pageContainerSchema`'s `isPrivate` field carries a `.default(false)` for entity-write
// purposes — Zod applies that default whenever the key is *absent* from the input, not just when
// it's `undefined`, so `.partial()` alone would silently turn an omitted `isPrivate` into an
// explicit `false` and make every name/emoji/cover-only PATCH look like a request to un-privatize
// the page. Overriding it with a plain `.optional()` boolean (no default) restores "omitted →
// untouched" semantics matching `name`/`emoji`/`cover`.
export const updatePageBodySchema = pageContainerSchema
  .pick({
    name: true,
    emoji: true,
    cover: true,
    isPrivate: true,
  })
  .partial()
  .extend({
    isPrivate: z.boolean().optional(),
  });

export const updatePageResponseSchema = pageSchema.extend({
  // Present only when the request body actually included `isPrivate` — total pages whose
  // `isPrivate`/`privateRootId` changed, including cascaded descendants. Kept as a
  // mutation-result field here rather than on `pageSchema` itself, since it's not a property of
  // the page.
  affectedPageCount: z.number().int().nonnegative().optional(),
});
export type UpdatePageBody = z.infer<typeof updatePageBodySchema>;
export type UpdatePageResponse = z.infer<typeof updatePageResponseSchema>;
export type UpdatePageResponseData = DataWrapper<UpdatePageResponse>;

// Parameters for ID-based operations
export const updatePageParametersSchema = z.object({
  id: z.string().min(1),
});
export type UpdatePageParameters = z.infer<typeof updatePageParametersSchema>;
