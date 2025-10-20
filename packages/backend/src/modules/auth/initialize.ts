import { toNodeHandler } from "better-auth/node";
import type { Express } from "express";
import { auth } from "./better-auth.js";

export function initialize(app: Express) {
	app.all("/api/auth/*splat", toNodeHandler(auth));
}
