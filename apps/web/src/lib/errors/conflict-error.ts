import { HttpError } from './http-error';

export class ConflictError extends HttpError {
  constructor(message: string = 'Conflict', visibleError: boolean = true) {
    super(message, 409, visibleError);
  }
}
