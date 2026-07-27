import { HttpError } from './http-error';

// Used when the caller is a known, authenticated member of the resource (so existence is
// already known to them) but lacks the specific permission/role required for the action —
// e.g. a non-owner workspace member attempting an owner-only action. For any case where the
// caller's access to the resource itself is in question, prefer NotFoundError (404) instead,
// to avoid leaking existence to non-members.
export class ForbiddenError extends HttpError {
  constructor(message: string = 'Forbidden', visibleError: boolean = true) {
    super(message, 403, visibleError);
  }
}
