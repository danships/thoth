import { z } from 'zod';

export const withIdSchema = z.object({
  id: z.string().min(1),
});

export const withParentIdSchema = z.object({
  parentId: z.string().min(1).nullable(),
});

export const withTrackUpdatesSchema = z.object({
  lastUpdated: z.string(),
  createdAt: z.string(),
});

export const withUserIdSchema = z.object({
  userId: z.string().min(1),
});

export const withWorkspaceIdSchema = z.object({
  workspaceId: z.string().min(1),
});
