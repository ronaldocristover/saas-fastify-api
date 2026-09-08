export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export const unauthorized = (code = 'UNAUTHORIZED', message = 'Unauthorized') =>
  new AppError(401, code, message)

export const forbidden = (code = 'FORBIDDEN', message = 'Forbidden') =>
  new AppError(403, code, message)

export const notFound = (code = 'NOT_FOUND', message = 'Not found') =>
  new AppError(404, code, message)

export const conflict = (code = 'CONFLICT', message = 'Conflict') =>
  new AppError(409, code, message)