import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVARIANT_VIOLATION'
  | 'INFRASTRUCTURE_ERROR';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST, details);
  }
}
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super('AUTHENTICATION_ERROR', message, HttpStatus.UNAUTHORIZED);
  }
}
export class AuthorizationError extends AppError {
  constructor(message = 'Permission denied') {
    super('AUTHORIZATION_ERROR', message, HttpStatus.FORBIDDEN);
  }
}
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super('CONFLICT', message, HttpStatus.CONFLICT);
  }
}
export class InvariantViolationError extends AppError {
  constructor(message: string) {
    super('INVARIANT_VIOLATION', message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

@Catch()
export class UnifiedErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>();
    const request = host.switchToHttp().getRequest<{ url?: string; requestId?: string }>();
    if (exception instanceof AppError) {
      response.status(exception.status).json({
        error: { code: exception.code, message: exception.message, details: exception.details ?? null },
        requestId: request.requestId ?? null,
        path: request.url ?? null,
      });
      return;
    }
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'INFRASTRUCTURE_ERROR', message: 'Unexpected server error', details: null },
      requestId: request.requestId ?? null,
      path: request.url ?? null,
    });
  }
}
