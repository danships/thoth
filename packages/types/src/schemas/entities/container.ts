import z from "zod";
import {
	withIdSchema,
	withParentIdSchema,
	withTrackUpdatesSchema,
	withUserIdSchema,
	withWorkspaceIdSchema,
} from "../utils.js";

export const containerSchema = z
	.object({
		name: z.string().min(1),
	})
	.extend(withTrackUpdatesSchema.shape)
	.extend(withWorkspaceIdSchema.shape)
	.extend(withUserIdSchema.shape)
	.extend(withIdSchema.shape);

export const pageContainerSchema = containerSchema
	.extend({
		type: z.literal("page"),
		emoji: z.string().min(1).nullable(),
	})
	.extend(withParentIdSchema.shape);
