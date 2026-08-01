import { z } from 'zod';
import type { DataWrapper } from '../utilities';

// Upload/serve (`POST /files`, `GET /files/:id/content`) are manual `NextRequest`/`NextResponse`
// handlers, not `apiRoute`-wrapped (see `src/app/api/v1/files/route.ts` for why: `apiRoute` is
// JSON-only and `multipart/form-data`/binary streaming don't fit its shape). These schemas are
// still shared with the API client / OpenAPI doc the same way `apiRoute`-based endpoints are.
export const UPLOAD_FILE_ENDPOINT = '/files';

export const uploadFileResponseSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string(),
  createdAt: z.string(),
});

export type UploadFileResponse = z.infer<typeof uploadFileResponseSchema>;
export type UploadFileResponseData = DataWrapper<UploadFileResponse>;

export const getFileParametersSchema = z.object({
  id: z.string().min(1),
});
export type GetFileParameters = z.infer<typeof getFileParametersSchema>;

export const getFileResponseSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string(),
  createdAt: z.string(),
  lastUpdated: z.string(),
});
export type GetFileResponse = z.infer<typeof getFileResponseSchema>;
export type GetFileResponseData = DataWrapper<GetFileResponse>;

export const deleteFileParametersSchema = getFileParametersSchema;
export type DeleteFileParameters = z.infer<typeof deleteFileParametersSchema>;

export const deleteFileResponseSchema = z.object({
  id: z.string(),
});
export type DeleteFileResponse = z.infer<typeof deleteFileResponseSchema>;
export type DeleteFileResponseData = DataWrapper<DeleteFileResponse>;

export const getWorkspaceStorageUsageParametersSchema = z.object({
  id: z.string().min(1),
});
export type GetWorkspaceStorageUsageParameters = z.infer<typeof getWorkspaceStorageUsageParametersSchema>;

export const getWorkspaceStorageUsageResponseSchema = z.object({
  usedBytes: z.number(),
  quotaBytes: z.number(),
});
export type GetWorkspaceStorageUsageResponse = z.infer<typeof getWorkspaceStorageUsageResponseSchema>;
export type GetWorkspaceStorageUsageResponseData = DataWrapper<GetWorkspaceStorageUsageResponse>;
