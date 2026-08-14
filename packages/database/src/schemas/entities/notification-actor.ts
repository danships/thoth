import { z } from 'zod';

// Mirrors `webhookActorSchema` in `@thoth/job-protocol`'s `webhook-job.ts` exactly (THOTH-066
// reuses the identical discriminated union as `notificationActorSchema` there) — duplicated
// here rather than imported so `@thoth/database` never depends on `@thoth/job-protocol` (the
// dependency direction is the other way around).
export const notificationActorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), userId: z.string().min(1).max(200) }).strict(),
  z
    .object({ type: z.literal('app'), appId: z.string().min(1).max(200), userId: z.string().min(1).max(200) })
    .strict(),
]);
export type NotificationActor = z.infer<typeof notificationActorSchema>;
