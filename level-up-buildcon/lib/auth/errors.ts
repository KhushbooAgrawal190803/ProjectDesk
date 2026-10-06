export class UnauthorizedError extends Error {
  readonly status = 401

  constructor(message = 'Authentication required') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  readonly status = 403

  constructor(message = 'You do not have permission to perform this action') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export function isAuthError(error: unknown): error is UnauthorizedError | ForbiddenError {
  return error instanceof UnauthorizedError || error instanceof ForbiddenError
}

export function authErrorStatus(error: unknown): number {
  if (error instanceof UnauthorizedError) return 401
  if (error instanceof ForbiddenError) return 403
  return 500
}
