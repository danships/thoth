import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../../core/logger.js";
import { auth } from "./better-auth.js";

export async function middleware(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	});

	if (!session) {
		logger.warn("Unauthorized request", { url: req.url, session });
		return res.status(401).json({ error: "Unauthorized" });
	}

	// biome-ignore lint/complexity/useLiteralKeys: TSconfig does not like the literal key.
	res.locals["session"] = session;
	return next();
}
