import winston from "winston";
import { environment } from "./environment.js";

export const logger = winston.createLogger({
	defaultMeta: { app: "thoth-backend" },
	level: environment.LOG_LEVEL,
	format: winston.format.json(),
	transports: [new winston.transports.Console()],
});
