import { HttpError } from './http-error';

export class NotAuthorizedError extends HttpError {
  constructor(message: string = 'Not authorized', visibleError: boolean = true) {
    super(message, 401, visibleError);
  }
}
