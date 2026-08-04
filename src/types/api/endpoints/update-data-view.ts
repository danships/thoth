import { z } from 'zod';
import { dataViewSchema, viewColumnLayoutItemSchema } from '../../schemas/entities/data-view';
import type { DataWrapper } from '../utilities';
import { getDataViewsResponseSchema } from './get-data-views';

// Define the endpoint path
export const UPDATE_DATA_VIEW_ENDPOINT = '/views/:id';

// Base data view schema for API responses (exclude sensitive fields)
export const updateDataViewApiSchema = dataViewSchema.omit({
  userId: true,
  workspaceId: true,
});

// Update data view
export const updateDataViewBodySchema = dataViewSchema
  .pick({
    name: true,
    dataSourceId: true,
    filters: true,
    sorts: true,
  })
  .partial()
  .extend({
    // `columnLayout` is redefined here (rather than picked from `dataViewSchema`) because the
    // entity's `.nullable().default(null)` would make an *omitted* key resolve to `null` even
    // through `.partial()` — indistinguishable from an explicit reset — which would break the
    // atomic-pair refine below (a request with only `filters`/`sorts` must leave `columnLayout`
    // truly `undefined`, not implicitly `null`).
    columnLayout: z.array(viewColumnLayoutItemSchema).nullable().optional(),
    // Required alongside `columnLayout` (THOTH-052): an optimistic-concurrency token compared
    // against the view's current `lastUpdated` server-side, so a stale client (e.g. a header
    // drag that started before another tab's edit landed) gets a `409` instead of silently
    // clobbering that concurrent change. Not required for other fields (name/dataSourceId/
    // filters/sorts), which predate this concurrency check.
    expectedLastUpdated: z.string().min(1).optional(),
  })
  .refine((body) => (body.columnLayout === undefined) === (body.expectedLastUpdated === undefined), {
    message: 'columnLayout and expectedLastUpdated must be provided together',
    path: ['expectedLastUpdated'],
  });

export const updateDataViewResponseSchema = getDataViewsResponseSchema.element;
export type UpdateDataViewBody = z.infer<typeof updateDataViewBodySchema>;
export type UpdateDataViewResponse = z.infer<typeof updateDataViewResponseSchema>;
export type UpdateDataViewResponseData = DataWrapper<UpdateDataViewResponse>;

// Parameters for ID-based operations
export const updateDataViewParametersSchema = z.object({
  id: z.string().min(1),
});
export type UpdateDataViewParameters = z.infer<typeof updateDataViewParametersSchema>;
