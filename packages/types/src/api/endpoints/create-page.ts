import type z from "zod";
import { pageSchema } from "../entities.js";
import type { DataWrapper } from "../utils.js";

// Define the endpoint path
export const CREATE_PAGE_ENDPOINT = "/pages";

// Define response schema
export const createPageResponseSchema = pageSchema;

// Export types
export type CreatePageResponse = z.infer<typeof createPageResponseSchema>;
export type CreatePageResponseData = DataWrapper<CreatePageResponse>;

// Define body schema for creating a page
export const createPageBodySchema = pageSchema.pick({
	name: true,
	emoji: true,
	parentId: true,
});

export type CreatePageBody = z.infer<typeof createPageBodySchema>;
