import { BadRequestError } from '@/lib/errors/bad-request-error';
import type { UpdatePageValuesEntry } from '@/types/api';
import { pageValueSchema } from '@/types/schemas/entities/container';
import type { Column, PageValue } from '@/types/schemas/entities/container';

/** Converts a transport value to the canonical representation stored on a page. */
export function normalizePageValueInput(column: Column, input: UpdatePageValuesEntry): PageValue {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    if (input.type !== column.type) {
      throw new BadRequestError(`Type mismatch for column: ${column.id}`);
    }

    // The request schema has already structurally validated this legacy branch. Parsing here
    // keeps this helper safe and ensures it always returns the canonical union.
    const parsed = pageValueSchema.safeParse(input);
    if (parsed.success) {
      return parsed.data;
    }
    throw new BadRequestError(`Invalid value for column: ${column.id}`);
  }

  const parsed = pageValueSchema.safeParse({ type: column.type, value: input });
  if (parsed.success) {
    return parsed.data;
  }
  throw new BadRequestError(`Invalid value for column: ${column.id}`);
}
