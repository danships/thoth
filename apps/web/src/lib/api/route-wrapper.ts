import type { NextRequest } from 'next/server';
import { connection, NextResponse } from 'next/server';
import type { z } from 'zod';
import { getSessionOrApiKey, type ApiKeySession } from '../auth/session';
import { assertGrantAllowsWrite } from '../auth/access-grant';
import { getLogger } from '../logger';
import { HttpError } from '@/lib/errors/http-error';
import { NotAuthorizedError } from '@/lib/errors/not-authorized-error';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

type ApiRouteOptions<ExpectedQuery = unknown, ExpectedParameters = unknown, ExpectedBody = unknown> = {
  expectedBodySchema?: z.ZodType<ExpectedBody>;
  expectedQuerySchema?: z.ZodType<ExpectedQuery>;
  expectedParamsSchema?: z.ZodType<ExpectedParameters>;
  // An App's own API key must never be usable to manage Apps/keys themselves (closes a
  // privilege-escalation loop). Set on every `/apps*` route — bearer-token auth is rejected
  // (401) there even for an otherwise-valid key.
  disallowApiKey?: boolean;
};

export function apiRoute<
  ResponseType = void,
  ExpectedQuery = undefined,
  ExpectedParameters = undefined,
  ExpectedBody = undefined,
>(
  options: ApiRouteOptions<ExpectedQuery, ExpectedParameters, ExpectedBody>,
  handler: (
    request: {
      body: ExpectedBody;
      query: ExpectedQuery;
      params: ExpectedParameters;
      // Additive escape hatch for routes that need to surface out-of-band metadata alongside a
      // response body whose shape must stay byte-for-byte backward-compatible (e.g. `GET /pages`
      // — see THOTH-037, where cursor-pagination metadata is only relevant to the new `viewId`
      // path and every other caller of the endpoint still expects a plain array response).
      // Ignored by every route that doesn't call it.
      setResponseHeader: (name: string, value: string) => void;
      // Merges arbitrary fields into the top-level JSON response body, as siblings of `data`
      // (e.g. `{ data: [...], pagination: {...} }`) — used instead of a custom response header
      // so pagination metadata is part of the regular JSON payload rather than hidden in an
      // out-of-band header (THOTH-037).
      setResponseMeta: (fields: Record<string, unknown>) => void;
      // Overrides the default 200 (or 204 for an `undefined` result) success status code — e.g.
      // `202` for a route that only durably accepted async work (THOTH-061 webhook resend).
      setResponseStatus: (status: number) => void;
    },
    session: ApiKeySession,
    request_: NextRequest
  ) => ResponseType | Promise<ResponseType>
) {
  return async (request: NextRequest, { params }: { params: Promise<ExpectedParameters> }) => {
    await connection();
    try {
      // Get session — cookie session if present, otherwise falls back to `Authorization:
      // Bearer <key>` auth (see `getSessionOrApiKey`).
      const session = await getSessionOrApiKey(request);

      if (session.appContext && options.disallowApiKey) {
        throw new NotAuthorizedError('API keys cannot be used to call this endpoint');
      }

      // A read-only key's App attempting a mutating verb is a permission violation (403), not
      // an authentication failure — enforced here so it never needs re-implementing per route.
      if (session.appContext && MUTATING_METHODS.has(request.method)) {
        assertGrantAllowsWrite(session.appContext.accessGrant);
      }

      // Resolve params
      const resolvedParameters = await params;

      // Parse request body if present
      let body: ExpectedBody | undefined;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        try {
          const rawBody = await request.text();
          body = rawBody ? JSON.parse(rawBody) : undefined;
        } catch {
          return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
      }

      // Validate body schema if provided. Runs even when the body is undefined (e.g. an empty
      // request) so a missing body is rejected as a 400 by Zod instead of reaching the handler
      // as `undefined` and causing a 500 when the handler accesses its fields.
      if (options.expectedBodySchema) {
        const validationResult = options.expectedBodySchema.safeParse(body);
        if (!validationResult.success) {
          return NextResponse.json(
            {
              error: 'Invalid request body',
              details: validationResult.error.issues,
            },
            { status: 400 }
          );
        }
        body = validationResult.data;
      }

      // Parse query parameters
      const url = new URL(request.url);
      let query = Object.fromEntries(url.searchParams.entries()) as ExpectedQuery;

      // Validate query schema if provided. Reassign `query` to the schema's parsed/coerced
      // output (mirroring the body validation above) so handlers receive real booleans/numbers
      // instead of the raw strings every query param arrives as (e.g. `z.coerce.boolean()`
      // would otherwise still hand back the string `"false"`, which is truthy).
      if (options.expectedQuerySchema) {
        const validationResult = options.expectedQuerySchema.safeParse(query);
        if (!validationResult.success) {
          return NextResponse.json(
            {
              error: 'Invalid query parameters',
              details: validationResult.error.issues,
            },
            { status: 400 }
          );
        }
        query = validationResult.data as ExpectedQuery;
      }

      // Validate params schema if provided
      if (options.expectedParamsSchema) {
        const validationResult = options.expectedParamsSchema.safeParse(resolvedParameters);
        if (!validationResult.success) {
          return NextResponse.json(
            {
              error: 'Invalid route parameters',
              details: validationResult.error.issues,
            },
            { status: 400 }
          );
        }
      }

      // Call the handler
      const responseHeaders: Record<string, string> = {};
      const responseMeta: Record<string, unknown> = {};
      let responseStatus: number | undefined;
      const result = await handler(
        {
          body: body as ExpectedBody,
          query: query as ExpectedQuery,
          params: resolvedParameters as ExpectedParameters,
          setResponseHeader: (name, value) => {
            responseHeaders[name] = value;
          },
          setResponseMeta: (fields) => {
            Object.assign(responseMeta, fields);
          },
          setResponseStatus: (status) => {
            responseStatus = status;
          },
        },
        session,
        request
      );

      if (result === undefined) {
        return new Response(null, { status: responseStatus ?? 204, headers: responseHeaders });
      }
      // Return the result
      return NextResponse.json(
        { data: result, ...responseMeta },
        { ...(responseStatus === undefined ? {} : { status: responseStatus }), headers: responseHeaders }
      );
    } catch (error) {
      const logger = await getLogger();
      logger.error('API route error:', error);

      if (error instanceof HttpError) {
        return NextResponse.json(
          { error: error.visibleError ? error.message : 'Something went wrong' },
          { status: error.httpErrorCode }
        );
      }

      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
