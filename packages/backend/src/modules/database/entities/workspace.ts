import type { EntityDefinition } from "supersave";

export const NAME = "workspace";

export const Workspace: EntityDefinition = {
	name: NAME,
	relations: [],
	template: {},
	filterSortFields: {
		name: "string",
		lastUpdated: "string",
		createdAt: "string",
		userId: "string",
	},
};
