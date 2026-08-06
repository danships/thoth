import { HttpError } from './http-error';

export class NotFoundError extends HttpError {
  constructor(message: string = 'Not Found', visibleError: boolean = true) {
    super(message, 404, visibleError);
  }
}
