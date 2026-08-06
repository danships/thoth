import { HttpError } from './http-error';

// Used when an uploaded file's extension/MIME type matches the dangerous-file denylist (see
// `src/lib/files/constants.ts`).
export class UnsupportedMediaTypeError extends HttpError {
  constructor(message: string = 'Unsupported media type', visibleError: boolean = true) {
    super(message, 415, visibleError);
  }
}
