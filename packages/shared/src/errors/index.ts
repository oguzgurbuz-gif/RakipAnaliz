export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      `${resource}${id ? ` with id ${id}` : ''} not found`,
      'NOT_FOUND',
      404
    );
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, context);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export class ScraperError extends AppError {
  constructor(
    message: string,
    public readonly siteId: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'SCRAPER_ERROR', 500, { siteId, ...context });
  }
}

export class RateLimitError extends AppError {
  constructor(siteId: string, retryAfter?: number) {
    super(
      `Rate limit exceeded for site ${siteId}`,
      'RATE_LIMIT',
      429,
      { retryAfter }
    );
  }
}
