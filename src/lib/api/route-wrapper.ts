import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { User } from 'better-auth';
import type { z } from 'zod';
import { getSession } from '../auth/session';
import { logger } from '../logger';

type ApiRouteOptions<ExpectedQuery = unknown, ExpectedParameters = unknown, ExpectedBody = unknown> = {
  expectedBodySchema?: z.ZodType<ExpectedBody>;
  expectedQuerySchema?: z.ZodType<ExpectedQuery>;
  expectedParamsSchema?: z.ZodType<ExpectedParameters>;
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
    },
    session: { user: User },
    request_: NextRequest
  ) => ResponseType | Promise<ResponseType>
) {
  return async (request: NextRequest, { params }: { params: Promise<ExpectedParameters> }) => {
    try {
      // Get session
      const session = await getSession();

      // Resolve params
      const resolvedParameters = await params;

      // Parse request body if present
      let body: ExpectedBody | undefined;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        try {
          body = await request.json();
        } catch {
          return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
      }

      // Validate body schema if provided
      if (options.expectedBodySchema && body !== undefined) {
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
      const query = Object.fromEntries(url.searchParams.entries()) as ExpectedQuery;

      // Validate query schema if provided
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
      const result = await handler(
        {
          body: body as ExpectedBody,
          query: query as ExpectedQuery,
          params: resolvedParameters as ExpectedParameters,
        },
        session,
        request
      );

      // Return the result
      return NextResponse.json({ data: result });
    } catch (error) {
      logger.error('API route error:', error);

      if (error instanceof Error && error.message === 'Session not found') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
