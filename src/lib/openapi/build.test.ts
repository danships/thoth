import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { validate } from '@readme/openapi-parser';
import { buildOpenApiDocument } from './build';

describe('buildOpenApiDocument', () => {
  let document: ReturnType<typeof buildOpenApiDocument> | null = null;

  beforeAll(() => {
    document = buildOpenApiDocument();
  });

  afterAll(() => {
    document = null;
  });

  test('builds an OpenAPI 3.1.0 document', () => {
    expect(document!.openapi).toBe('3.1.0');
  });

  test('assigns unique operation ids and keeps app routes session-only', () => {
    const seenOperationIds = new Set<string>();
    for (const [path, pathItem] of Object.entries(document!.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        expect(operation.operationId, `${method.toUpperCase()} ${path} is missing an operationId`).toBeTruthy();
        expect(seenOperationIds.has(operation.operationId), `Duplicate operationId: ${operation.operationId}`).toBe(
          false
        );
        seenOperationIds.add(operation.operationId);

        if (path.startsWith('/apps')) {
          expect(operation.security).toEqual([{ sessionCookie: [] }]);
        }
      }
    }
  });

  test('exposes the pages tree limit query parameter with a schema', () => {
    const pagesTreeLimit = document!.paths['/pages/tree']?.['get']?.parameters?.find(
      (parameter) => parameter.in === 'query' && parameter.name === 'limit'
    );
    expect(pagesTreeLimit).toBeTruthy();
    expect(typeof pagesTreeLimit!.schema).toBe('object');
    expect(
      Object.prototype.hasOwnProperty.call(pagesTreeLimit!.schema, 'type') || '$ref' in pagesTreeLimit!.schema
    ).toBeTruthy();
  });

  test('validates the generated OpenAPI document', async () => {
    const validationResult = await validate(document!);
    expect(validationResult.valid).toBeTruthy();
  });
});
