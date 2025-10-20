import cors from "cors";
import express from "express";
import { initializeHttpApi } from "./core/api/initialize-http-api.js";
import { environment } from "./core/environment.js";
import { logger } from "./core/logger.js";
import { initialize as initializeAuth } from "./modules/auth/initialize.js";
import { initialize as initializeDatabase } from "./modules/database/index.js";

export async function main() {
	const app = express();

	// Use CORS with credentials enabled and specific origin for /api
	app.use(
		"/api",
		cors({
			origin: (origin, callback) => {
				// Allow requests with an Origin header, otherwise reject
				// You can customize allowed origins logic here
				if (origin) {
					callback(null, origin);
				} else {
					//callback(new Error("Origin header is missing"), false);
					callback(null);
				}
			},
			credentials: true,
		}),
	);
	if (environment.isDevelopment) {
		app.use((req, _res, next) => {
			logger.debug(req.method, req.url);
			next();
		});
	}

	initializeAuth(app);
	await initializeDatabase();

	app.use(initializeHttpApi());

	app.listen(environment.PORT, () => {
		logger.info(`Thoth backend is running`, { port: environment.PORT });
	});
}

await main();
