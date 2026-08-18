import { z } from 'zod';
import { pageValueSchema } from '../../schemas/entities/container';

export const GET_PAGE_REVISION_ENDPOINT = '/pages/:id/history/:revisionId';

export const getPageRevisionParametersSchema = z.object({
  id: z.string().min(1),
  revisionId: z.string().min(1),
});
export type GetPageRevisionParameters = z.infer<typeof getPageRevisionParametersSchema>;

// Target-discriminated: returns the reconstructed state at the chosen revision alongside the
// page's current state, so the client can render either a markdown char-diff (content) or a
// per-column before/after table (values). Raw content is only ever returned here, for the one
// revision the caller explicitly opened — never from the list endpoint.
export const getPageRevisionResponseSchema = z.discriminatedUnion('target', [
  z.object({
    target: z.literal('content'),
    sequence: z.number().int(),
    content: z.string(),
    currentContent: z.string(),
  }),
  z.object({
    target: z.literal('values'),
    sequence: z.number().int(),
    values: z.record(z.string(), pageValueSchema),
    currentValues: z.record(z.string(), pageValueSchema),
    // Current (not historical) id -> name pairs for every column still on the parent Data
    // Source, so the client can label the diff table without a second round-trip. Columns
    // removed from the Data Source since the revision are simply absent here; the client falls
    // back to displaying the raw id.
    columns: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
]);
export type GetPageRevisionResponse = z.infer<typeof getPageRevisionResponseSchema>;
