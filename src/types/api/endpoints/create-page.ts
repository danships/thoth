import { z } from 'zod';
import { pageSchema } from '../entities';
import type { DataWrapper } from '../utilities';

// Define the endpoint path
export const CREATE_PAGE_ENDPOINT = '/pages';

// Define response schema
export const createPageResponseSchema = pageSchema;

// Export types
export type CreatePageResponse = z.infer<typeof createPageResponseSchema>;
export type CreatePageResponseData = DataWrapper<CreatePageResponse>;

// Define body schema for creating a page
export const createPageBodySchema = pageSchema
  .pick({
    name: true,
    emoji: true,
    parentId: true,
  })
  .extend({
    // `.pick()` preserves the underlying `pageSchema.shape.emoji` type
    // (`z.string().min(1).nullable()`, a required key) — override it here so omitting `emoji`
    // entirely is also accepted (treated the same as explicit `null`), while still rejecting an
    // empty string (`min(1)` is preserved).
    emoji: z.string().min(1).nullable().optional(),
    // Required only when `parentId` is absent (i.e. creating a root/top-level page) — there is
    // no existing entity to derive the workspace from in that case. When `parentId` is present,
    // the workspace is instead derived from the parent page and this field is ignored.
    workspaceId: z.string().min(1).optional(),
  });

export type CreatePageBody = z.infer<typeof createPageBodySchema>;
