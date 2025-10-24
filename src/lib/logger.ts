import winston from 'winston';
import { getEnvironment } from './environment';

/**
 * Logger instance with lazy initialization.
 *
 * We lazily initialize the logger to avoid calling getEnvironment() during import.
 * This is important because:
 *
 * 1. getEnvironment() validates environment variables and may throw errors
 * 2. Module imports happen at build time and in various contexts where environment
 *    validation might not be appropriate or desired
 * 3. By deferring initialization until the logger is actually used, we ensure
 *    environment validation only occurs when needed
 */

let loggerInstance: winston.Logger | null = null;

async function initializeLogger(): Promise<winston.Logger> {
  if (loggerInstance === null) {
    const environment = await getEnvironment();

    loggerInstance = winston.createLogger({
      level: environment.LOG_LEVEL,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'thoth' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
      ],
    });
  }

  return loggerInstance;
}

export async function getLogger(): Promise<winston.Logger> {
  return initializeLogger();
}
