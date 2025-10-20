import {
	type CreatePageBody,
	type CreatePageResponse,
	createPageBodySchema,
} from "@thoth/types/api";
import type { PageContainerCreate } from "@thoth/types/database";
import { apiRoute } from "../../../core/api/api-route.js";
import { addUserIdToQuery } from "../../database/helpers.js";
import {
	getContainerRepository,
	getWorkspaceRepository,
} from "../../database/index.js";

export const createPage = apiRoute<
	CreatePageResponse,
	never,
	never,
	CreatePageBody
>(
	{
		expectedBodySchema: createPageBodySchema,
	},
	async ({ body }, session) => {
		if (!body) {
			throw new Error("Body is required");
		}

		const workspaceRepository = getWorkspaceRepository();
		const workspace = await workspaceRepository.getOneByQuery(
			addUserIdToQuery(workspaceRepository.createQuery(), session.user.id),
		);

		if (!workspace) {
			throw new Error("Workspace not found");
		}

		const containerRepository = getContainerRepository();

		// Validate parent page access if parentId is provided
		let parentId = null;
		if (body.parentId) {
			const parentPage = await containerRepository.getOneByQuery(
				addUserIdToQuery(
					containerRepository.createQuery().eq("id", body.parentId),
					session.user.id,
				),
			);

			if (!parentPage) {
				throw new Error("Parent page not found or access denied");
			}

			// Ensure the parent page belongs to the same workspace
			if (parentPage.workspaceId !== workspace.id) {
				throw new Error("Parent page does not belong to the same workspace");
			}

			parentId = body.parentId;
		}

		// Create the page container with the provided data
		const pageData: PageContainerCreate = {
			name: body.name,
			emoji: body.emoji || null,
			type: "page",
			parentId: parentId,
			workspaceId: workspace.id,
			userId: session.user.id,
			lastUpdated: new Date().toISOString(),
			createdAt: new Date().toISOString(),
		};

		const createdPage = await containerRepository.create(pageData);

		return {
			name: createdPage.name,
			emoji: createdPage.emoji,
			type: createdPage.type,
			parentId: createdPage.parentId,
			createdAt: createdPage.createdAt,
			lastUpdated: createdPage.lastUpdated,
			id: createdPage.id,
		};
	},
);
