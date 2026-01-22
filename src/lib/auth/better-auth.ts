import { getAuth } from './config';

/**
 * This file is not used in this application itself, but is used for the better-auth CLI to generate
 * the schema.sql file.
 */

export const auth = await getAuth(true);
