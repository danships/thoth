import z from "zod";
import {
	withIdSchema,
	withTrackUpdatesSchema,
	withUserIdSchema,
} from "../utils.js";

export const workspaceSchema = z
	.object({
		name: z.string().min(1),
	})
	.extend(withTrackUpdatesSchema.shape)
	.extend(withUserIdSchema.shape)
	.extend(withIdSchema.shape);
