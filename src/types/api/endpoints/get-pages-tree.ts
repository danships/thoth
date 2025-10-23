import { z } from 'zod';
import { withIdSchema } from '../../schemas/utilities';
import { pageSchema } from '../entities';
import type { DataWrapper } from '../utilities';

export const GET_PAGES_TREE_ENDPOINT = '/pages/tree';

const pagesTreeBranchSchema = z.array(
  z.object({
    page: pageSchema.extend(withIdSchema.shape),
    children: z.array(
      z.object({
        page: pageSchema,
      })
    ),
  })
);

export const getPagesTreeResponseSchema = z.object({
  branches: pagesTreeBranchSchema,
});

export type GetPagesTreeResponse = z.infer<typeof getPagesTreeResponseSchema>;
export type GetPagesTreeResponseData = DataWrapper<GetPagesTreeResponse>;

export const getPagesTreeQueryVariablesSchema = z.object({
  parentId: z.string().min(1).optional(),
});
export type GetPagesTreeQueryVariables = z.infer<typeof getPagesTreeQueryVariablesSchema>;
