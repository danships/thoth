import { HttpError } from './http-error';

export class BadRequestError extends HttpError {
  constructor(message: string = 'Bad Request', visibleError: boolean = true) {
    super(message, 400, visibleError);
  }
}
