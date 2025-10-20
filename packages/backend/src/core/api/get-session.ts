/** biome-ignore-all lint/complexity/useLiteralKeys: TSconfig does not like the literal key. */
import type { User } from "better-auth";
import type { Response } from "express";

export function getSession(res: Response): { user: User } {
	if (res.locals["session"]) {
		return res.locals["session"] as { user: User };
	}

	throw new Error("Session not found");
}
