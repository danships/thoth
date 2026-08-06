import type { z } from 'zod';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type AuthMode = 'session' | 'sessionOrApiKey' | 'none';
export type ResponseWrapperMode = 'data' | 'raw';

export type OpenApiOperation = {
  path: string;
  method: HttpMethod;
  operationId: string;
  summary?: string;
  tags?: string[];
  auth: AuthMode;
  query?: z.ZodType;
  params?: z.ZodType;
  body?: z.ZodType;
  response?: z.ZodType;
  responseWrapper?: ResponseWrapperMode;
  // Additional properties merged as siblings of `data` in the generated response schema (e.g.
  // `{ data: [...], pagination: {...} }`) — used for endpoints whose out-of-band metadata
  // (THOTH-037 cursor pagination) lives at the response's root rather than nested inside `data`.
  // Always optional in the generated schema, since the metadata is only populated conditionally.
  responseMeta?: Record<string, z.ZodType>;
  successStatus?: 200 | 201 | 204;
  errorStatuses?: number[];
};

export type OperationRegistry = OpenApiOperation[];
