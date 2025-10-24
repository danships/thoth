import { z } from 'zod';

// TODO generate the correct zod schemas from the BlockNote block types
export const blockSchema = z.any();

export type Block = z.infer<typeof blockSchema>;
