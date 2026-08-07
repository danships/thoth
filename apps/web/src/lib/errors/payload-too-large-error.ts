import { HttpError } from './http-error';

// Used when an uploaded file exceeds `MAX_UPLOAD_SIZE_BYTES` (the per-file cap, distinct from
// the per-workspace quota, which is a `409 ConflictError`).
export class PayloadTooLargeError extends HttpError {
  constructor(message: string = 'Payload too large', visibleError: boolean = true) {
    super(message, 413, visibleError);
  }
}
