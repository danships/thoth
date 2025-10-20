import type { User } from "better-auth";
import type { Request, RequestHandler, Response } from "express";
import type z from "zod";
import { getSession } from "./get-session.js";

type ApiRouteOptions<
	ExpectedQuery = unknown,
	ExpectedParams = unknown,
	ExpectedBody = unknown,
> = {
	expectedBodySchema?: z.ZodType<ExpectedBody>;
	expectedQuerySchema?: z.ZodType<ExpectedQuery>;
	expectedParamsSchema?: z.ZodType<ExpectedParams>;
};

export function apiRoute<
	ResponseType = void,
	ExpectedQuery = undefined,
	ExpectedParams = undefined,
	ExpectedBody = undefined,
>(
	{
		expectedBodySchema,
		expectedQuerySchema,
		expectedParamsSchema,
	}: ApiRouteOptions<ExpectedQuery, ExpectedParams, ExpectedBody>,
	handler: (
		request: {
			body: ExpectedBody;
			query: ExpectedQuery;
			params: ExpectedParams;
		},
		session: { user: User },
		req: Request,
		res: Response,
	) => ResponseType | Promise<ResponseType>,
): RequestHandler {
	return async (req, res, next) => {
		let parsedBody: ExpectedBody;
		let parsedQuery: ExpectedQuery;
		let parsedParams: ExpectedParams;

		try {
			if (expectedBodySchema) {
				const result = expectedBodySchema.safeParse(req.body);
				if (!result.success) {
					return res.status(400).json({
						error: "Invalid request body",
						details: result.error.issues,
					});
				}
				parsedBody = result.data;
			}
			if (expectedQuerySchema) {
				const result = expectedQuerySchema.safeParse(req.query);
				if (!result.success) {
					return res.status(400).json({
						error: "Invalid request query",
						details: result.error.issues,
					});
				}
				parsedQuery = result.data;
			}
			if (expectedParamsSchema) {
				const result = expectedParamsSchema.safeParse(req.params);
				if (!result.success) {
					return res.status(400).json({
						error: "Invalid request params",
						details: result.error.issues,
					});
				}
				parsedParams = result.data;
			}

			const session = getSession(res);

			const result: ResponseType = await handler(
				// @ts-expect-error - allow parsedBody, parsedQuery, parsedParams to be undefined
				{ body: parsedBody, query: parsedQuery, params: parsedParams },
				session,
				req,
				res,
			);
			if (result) {
				res.json({ data: result });
			}
			return;
		} catch (err) {
			return next(err);
		}
	};
}
