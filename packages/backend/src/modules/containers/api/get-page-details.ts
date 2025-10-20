import {
	type GetPageDetailsParams,
	type GetPageDetailsResponse,
	getPageDetailsParamsSchema,
} from "@thoth/types/api";
import { apiRoute } from "../../../core/api/api-route.js";
import { NotFoundError } from "../../../core/api/errors.js";
import { addUserIdToQuery } from "../../database/helpers.js";
import { getContainerRepository } from "../../database/index.js";

export const getPageDetails = apiRoute<
	GetPageDetailsResponse,
	undefined,
	GetPageDetailsParams
>(
	{
		expectedParamsSchema: getPageDetailsParamsSchema,
	},
	async ({ params }, session): Promise<GetPageDetailsResponse> => {
		const containerRepository = getContainerRepository();

		const dbQuery = addUserIdToQuery(
			containerRepository.createQuery(),
			session.user.id,
		).eq("id", params?.id);

		const page = await containerRepository.getOneByQuery(dbQuery);

		if (!page) {
			throw new NotFoundError("Page not found");
		}

		return {
			page: {
				id: page.id,
				name: page.name,
				emoji: page.emoji,
				type: page.type,
				lastUpdated: page.lastUpdated,
				createdAt: page.createdAt,
				parentId: page.parentId,
			},
		};
	},
);
