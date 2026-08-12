import winston from 'winston';
import { getEnvironment } from './environment';

/**
 * Logger for `@thoth/jobs`. Mirrors `apps/web/src/lib/logger.ts`'s lazy-init pattern but is
 * fully independent of the web package. Log lines never include full payloads, results, or
 * stack traces — only ids, types, statuses, attempt counts, and durations (see THOTH-059's
 * Security Considerations).
 */
let loggerInstance: winston.Logger | null = null;

export function getLogger(): winston.Logger {
  if (loggerInstance === null) {
    const environment = getEnvironment();

    loggerInstance = winston.createLogger({
      level: environment.LOG_LEVEL,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      defaultMeta: { service: 'thoth-jobs' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
      ],
    });
  }

  return loggerInstance;
}
