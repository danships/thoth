import z from "zod";

export const withTrackUpdatesSchema = z.object({
	lastUpdated: z.string().datetime(),
	createdAt: z.string().datetime(),
});

export const withParentIdSchema = z.object({
	parentId: z.string().min(1).nullable(),
});

export const withUserIdSchema = z.object({
	userId: z.string().min(1),
});

export const withWorkspaceIdSchema = z.object({
	workspaceId: z.string().min(1),
});

export const withIdSchema = z.object({
	id: z.string().min(1),
});
