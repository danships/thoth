import { HttpError } from './http-error';

/** 503 — the jobs process/socket rejected or failed to acknowledge the request; nothing was
 * accepted. Message is safe to show (never leaks socket paths/internal error detail). */
export class ServiceUnavailableError extends HttpError {
  constructor(message: string = 'Service unavailable', visibleError: boolean = true) {
    super(message, 503, visibleError);
  }
}
