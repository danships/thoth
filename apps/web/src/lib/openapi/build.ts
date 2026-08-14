import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { operations } from './registry';
import type { AuthMode, HttpMethod, OpenApiOperation } from './types';

export type OpenApiSchema = Record<string, unknown>;
export type OpenAPIObject = {
  openapi: '3.1.0';
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string }>;
  tags: Array<{ name: string }>;
  paths: Record<string, Record<string, OpenApiOperationObject>>;
  components: {
    securitySchemes: Record<string, OpenApiSecurityScheme>;
    schemas: Record<string, OpenApiSchema>;
  };
};

type OpenApiSecurityScheme =
  | { type: 'apiKey'; in: 'cookie'; name: string; description?: string }
  | { type: 'http'; scheme: 'bearer'; description?: string };

type OpenApiParameter = {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  schema: OpenApiSchema;
  description?: string;
};

type OpenApiResponse = {
  description: string;
  content?: {
    'application/json': {
      schema: OpenApiSchema;
    };
  };
};

type OpenApiOperationObject = {
  operationId: string;
  summary?: string;
  tags?: string[];
  security: Array<Record<string, string[]>>;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required: true;
    content: {
      'application/json': {
        schema: OpenApiSchema;
      };
    };
  };
  responses: Record<string, OpenApiResponse>;
};

type JsonSchemaWithDefs = OpenApiSchema & {
  $defs?: Record<string, OpenApiSchema>;
};

const PACKAGE_VERSION = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
  version: string;
};

const ERROR_SCHEMA: OpenApiSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
  },
};

const VALIDATION_ERROR_SCHEMA: OpenApiSchema = {
  type: 'object',
  required: ['error', 'details'],
  properties: {
    error: { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
};

export function buildOpenApiDocument(): OpenAPIObject {
  const componentSchemas: Record<string, OpenApiSchema> = {
    Error: ERROR_SCHEMA,
    ValidationError: VALIDATION_ERROR_SCHEMA,
  };

  const paths: OpenAPIObject['paths'] = {};

  for (const operation of operations) {
    const parameters = [
      ...buildParameters(operation, 'query', componentSchemas),
      ...buildParameters(operation, 'path', componentSchemas),
    ];

    const requestBody = operation.body
      ? {
          required: true as const,
          content: {
            'application/json': {
              schema: normalizeSchema(
                z.toJSONSchema(operation.body, schemaOptions('input')),
                componentSchemas,
                `${operation.operationId}Body`
              ),
            },
          },
        }
      : undefined;

    const responses = buildResponses(operation, componentSchemas);

    const operationObject: OpenApiOperationObject = {
      operationId: operation.operationId,
      summary: operation.summary,
      tags: operation.tags,
      security: securityFor(operation.auth),
      responses,
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(requestBody ? { requestBody } : {}),
    };

    const pathItem = (paths[operation.path] ??= {});
    pathItem[operation.method] = operationObject;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Thoth API',
      version: PACKAGE_VERSION.version,
      description:
        'Build-time generated OpenAPI document for the Thoth API. It is assembled from the shared Zod endpoint and entity schemas, then committed to `public/openapi.json` for static serving.',
    },
    servers: [{ url: '/api/v1' }],
    // Declared from the operations themselves (rather than hand-maintained) so a new tag used
    // by an operation can never go undeclared, and an unused tag can never linger.
    tags: [...new Set(operations.flatMap((operation) => operation.tags ?? []))]
      .toSorted((a, b) => a.localeCompare(b))
      .map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'thoth-auth.session_token',
          description:
            'Better Auth session cookie. In production this is prefixed with __Secure- (i.e. __Secure-thoth-auth.session_token).',
        },
        bearerApiKey: {
          type: 'http',
          scheme: 'bearer',
          description: 'App API key sent as Authorization: Bearer <key>.',
        },
      },
      schemas: sortRecord(componentSchemas),
    },
  };
}

function buildParameters(
  operation: OpenApiOperation,
  location: 'query' | 'path',
  componentSchemas: Record<string, OpenApiSchema>
): OpenApiParameter[] {
  const schema = location === 'query' ? operation.query : operation.params;
  if (!schema) {
    return [];
  }

  const objectSchema = normalizeSchema(
    z.toJSONSchema(schema, schemaOptions('input')),
    componentSchemas,
    `${operation.operationId}${location === 'query' ? 'Query' : 'Params'}`
  );
  const properties = asRecord(objectSchema['properties']);
  const required = new Set(Array.isArray(objectSchema['required']) ? objectSchema['required'] : undefined);

  return Object.entries(properties).map(([name, value]) => {
    const parameterSchema = stripRootSchemaKeys(clone(value));
    return {
      name,
      in: location,
      required: location === 'path' ? true : required.has(name),
      schema: parameterSchema,
      ...(typeof value['description'] === 'string' ? { description: value['description'] } : {}),
    };
  });
}

function buildResponses(
  operation: OpenApiOperation,
  componentSchemas: Record<string, OpenApiSchema>
): Record<string, OpenApiResponse> {
  const responses: Record<string, OpenApiResponse> = {};
  const successStatus = String(resolveSuccessStatus(operation));

  if (operation.response) {
    const responseSchema = normalizeSchema(
      z.toJSONSchema(operation.response, schemaOptions('output')),
      componentSchemas,
      `${operation.operationId}Response`
    );
    const metaProperties = operation.responseMeta
      ? Object.fromEntries(
          Object.entries(operation.responseMeta).map(([key, schema]) => [
            key,
            normalizeSchema(
              z.toJSONSchema(schema, schemaOptions('output')),
              componentSchemas,
              `${operation.operationId}${key.charAt(0).toUpperCase()}${key.slice(1)}`
            ),
          ])
        )
      : undefined;
    responses[successStatus] = {
      description: successDescription(Number(successStatus), operation.method),
      content: {
        'application/json': {
          schema:
            (operation.responseWrapper ?? 'data') === 'raw'
              ? responseSchema
              : {
                  type: 'object',
                  required: ['data'],
                  properties: {
                    data: responseSchema,
                    ...metaProperties,
                  },
                },
        },
      },
    };
  } else {
    responses[successStatus] = { description: 'No content' };
  }

  const statuses = new Set<number>(operation.errorStatuses);

  if (operation.auth !== 'none') {
    statuses.add(401);
  }
  if (operation.query || operation.params || operation.body) {
    statuses.add(400);
  }
  if (operation.params) {
    statuses.add(404);
  }
  if (operation.path.startsWith('/apps')) {
    statuses.add(403);
  }
  if (operation.auth === 'sessionOrApiKey' && isMutatingMethod(operation.method)) {
    statuses.add(403);
  }
  statuses.add(500);

  for (const status of [...statuses].toSorted((left, right) => left - right)) {
    if (status === Number(successStatus)) {
      continue;
    }

    responses[String(status)] = {
      description: errorDescription(status),
      ...(status === 204
        ? {}
        : {
            content: {
              'application/json': {
                schema: {
                  $ref: status === 400 ? '#/components/schemas/ValidationError' : '#/components/schemas/Error',
                },
              },
            },
          }),
    };
  }

  return responses;
}

function normalizeSchema(
  rawSchema: JsonSchemaWithDefs,
  componentSchemas: Record<string, OpenApiSchema>,
  _schemaName = 'Schema'
): OpenApiSchema {
  const schema = clone(rawSchema);
  inlineAnonymousDefs(schema);
  extractDefs(schema, componentSchemas);
  rewriteReferences(schema);
  return stripRootSchemaKeys(schema);
}

function inlineAnonymousDefs(node: unknown): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      inlineAnonymousDefs(entry);
    }
    return;
  }

  const record = node as Record<string, unknown>;
  const defs = asRecord(record['$defs']);
  if (Object.keys(defs).length > 0) {
    const anonymousDefs = new Map(
      Object.entries(defs)
        .filter(([name]) => isAnonymousSchemaName(name))
        .map(([name, definition]) => [name, clone(definition)])
    );
    if (anonymousDefs.size > 0) {
      inlineAnonymousDefinitionReferences(record, anonymousDefs);
      const remainingDefs = Object.fromEntries(Object.entries(defs).filter(([name]) => !isAnonymousSchemaName(name)));
      if (Object.keys(remainingDefs).length > 0) {
        record['$defs'] = remainingDefs;
      } else {
        delete record['$defs'];
      }
    }
  }

  for (const value of Object.values(record)) {
    inlineAnonymousDefs(value);
  }
}

function extractDefs(node: unknown, componentSchemas: Record<string, OpenApiSchema>): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  const record = node as Record<string, unknown>;
  if ('$defs' in record) {
    const defs = asRecord(record['$defs']);
    for (const [name, definition] of Object.entries(defs)) {
      const component = clone(definition);
      extractDefs(component, componentSchemas);
      rewriteReferences(component);
      const normalized = stripRootSchemaKeys(component);
      mergeComponentSchema(name, normalized, componentSchemas);
    }
    delete record['$defs'];
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        extractDefs(entry, componentSchemas);
      }
      continue;
    }
    extractDefs(value, componentSchemas);
  }
}

function rewriteReferences(node: unknown): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      rewriteReferences(entry);
    }
    return;
  }

  const record = node as Record<string, unknown>;
  if (typeof record['$ref'] === 'string' && record['$ref'].startsWith('#/$defs/')) {
    record['$ref'] = record['$ref'].replace('#/$defs/', '#/components/schemas/');
  }

  for (const value of Object.values(record)) {
    rewriteReferences(value);
  }
}

function mergeComponentSchema(
  name: string,
  schema: OpenApiSchema,
  componentSchemas: Record<string, OpenApiSchema>
): void {
  const existing = componentSchemas[name];
  if (!existing) {
    componentSchemas[name] = schema;
    return;
  }

  if (stableStringify(existing) !== stableStringify(schema)) {
    throw new Error(`OpenAPI component schema collision for ${name}`);
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortValue(entry)])
  );
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).toSorted(([left], [right]) => left.localeCompare(right)));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function asRecord(value: unknown): Record<string, OpenApiSchema> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, OpenApiSchema>;
}

function stripRootSchemaKeys(schema: OpenApiSchema): OpenApiSchema {
  const next = clone(schema);
  delete next['$schema'];
  delete next['id'];
  delete next['~standard'];
  return next;
}

function inlineAnonymousDefinitionReferences(node: unknown, anonymousDefs: Map<string, OpenApiSchema>): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      inlineAnonymousDefinitionReferences(entry, anonymousDefs);
    }
    return;
  }

  const record = node as Record<string, unknown>;
  if (typeof record['$ref'] === 'string') {
    for (const [name, definition] of anonymousDefs) {
      if (record['$ref'] === `#/$defs/${name}`) {
        delete record['$ref'];
        const inlined = clone(definition);
        inlineAnonymousDefinitionReferences(inlined, anonymousDefs);
        Object.assign(record, inlined);
        break;
      }
    }
  }

  for (const value of Object.values(record)) {
    inlineAnonymousDefinitionReferences(value, anonymousDefs);
  }
}

function isAnonymousSchemaName(name: string): boolean {
  return /^__schema\d+$/.test(name);
}

function schemaOptions(io: 'input' | 'output') {
  return {
    io,
    reused: 'ref' as const,
    target: 'draft-2020-12' as const,
  };
}

function resolveSuccessStatus(operation: OpenApiOperation): 200 | 201 | 204 {
  if (operation.successStatus) {
    return operation.successStatus;
  }
  if (!operation.response) {
    return 204;
  }
  return operation.method === 'post' ? 201 : 200;
}

function isMutatingMethod(method: HttpMethod): boolean {
  return ['post', 'patch', 'put', 'delete'].includes(method);
}

function securityFor(auth: AuthMode): Array<Record<string, string[]>> {
  if (auth === 'none') {
    return [];
  }
  if (auth === 'session') {
    return [{ sessionCookie: [] }];
  }
  return [{ sessionCookie: [] }, { bearerApiKey: [] }];
}

function successDescription(status: number, method: HttpMethod): string {
  if (status === 201) {
    return 'Created';
  }
  if (status === 204) {
    return 'No content';
  }
  if (method === 'get') {
    return 'Successful response';
  }
  return 'Successful response';
}

function errorDescription(status: number): string {
  switch (status) {
    case 400: {
      return 'Validation error';
    }
    case 401: {
      return 'Not authorized';
    }
    case 403: {
      return 'Forbidden';
    }
    case 404: {
      return 'Not found';
    }
    case 409: {
      return 'Conflict';
    }
    case 410: {
      return 'Gone';
    }
    case 500: {
      return 'Internal server error';
    }
    default: {
      return 'Error';
    }
  }
}
