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
  successStatus?: 200 | 201 | 204;
  errorStatuses?: number[];
};

export type OperationRegistry = OpenApiOperation[];
