export class HttpError extends Error {
  public httpErrorCode: number;
  public visibleError: boolean;

  /**
   * Create an HttpError
   * @param message - optional error message
   * @param httpErrorCode - numeric HTTP status code associated with the error (defaults to 500)
   * @param visibleError - whether this error message is safe to show to end users (defaults to false)
   */
  constructor(message?: string, httpErrorCode = 500, visibleError = false) {
    super(message);
    this.name = 'HttpError';
    this.httpErrorCode = httpErrorCode;
    this.visibleError = visibleError;
  }
}
