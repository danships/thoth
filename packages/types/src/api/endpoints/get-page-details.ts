import z from "zod";

import { pageSchema } from "../entities.js";
import type { DataWrapper } from "../utils.js";

export const GET_PAGE_DETAILS_ENDPOINT = "/pages/:id";

export const getPageDetailsResponseSchema = z.object({
	page: pageSchema,
});

export type GetPageDetailsResponse = z.infer<
	typeof getPageDetailsResponseSchema
>;
export type GetPageDetailsResponseData = DataWrapper<GetPageDetailsResponse>;

export const getPageDetailsParamsSchema = z.object({
	id: z.string().min(1),
});
export type GetPageDetailsParams = z.infer<typeof getPageDetailsParamsSchema>;
