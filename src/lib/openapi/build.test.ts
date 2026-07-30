import assert from 'node:assert/strict';
import { validate } from '@readme/openapi-parser';
import { buildOpenApiDocument } from './build';

const document = buildOpenApiDocument();

assert.equal(document.openapi, '3.1.0');

const seenOperationIds = new Set<string>();
for (const [path, pathItem] of Object.entries(document.paths)) {
  for (const [method, operation] of Object.entries(pathItem)) {
    assert.ok(operation.operationId, `${method.toUpperCase()} ${path} is missing an operationId`);
    assert.ok(!seenOperationIds.has(operation.operationId), `Duplicate operationId: ${operation.operationId}`);
    seenOperationIds.add(operation.operationId);

    if (path.startsWith('/apps')) {
      assert.deepEqual(
        operation.security,
        [{ sessionCookie: [] }],
        `${method.toUpperCase()} ${path} must be session-only`
      );
    }
  }
}

const pagesTreeLimit = document.paths['/pages/tree']?.['get']?.parameters?.find(
  (parameter) => parameter.in === 'query' && parameter.name === 'limit'
);
assert.ok(pagesTreeLimit, 'GET /pages/tree should expose the limit query parameter');
assert.equal(typeof pagesTreeLimit.schema, 'object');
assert.ok(
  Object.prototype.hasOwnProperty.call(pagesTreeLimit.schema, 'type') || '$ref' in pagesTreeLimit.schema,
  'GET /pages/tree limit parameter should have a JSON schema'
);

await validate(document);
