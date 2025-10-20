import { pageContainerSchema } from "../schemas/entities/container.js";

export const pageSchema = pageContainerSchema.omit({
	workspaceId: true,
	userId: true,
});

export const pageCreateSchema = pageSchema.omit({ id: true });
