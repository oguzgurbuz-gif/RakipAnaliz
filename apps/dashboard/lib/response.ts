import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from '@bitalih/shared/errors';

export interface ApiResponseMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: ApiResponseMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function successResponse<T>(
  data: T,
  meta?: ApiResponseMeta
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(meta && { meta }),
    },
    { status: 200 }
  );
}

export function createdResponse<T>(
  data: T,
  meta?: ApiResponseMeta
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(meta && { meta }),
    },
    { status: 201 }
  );
}

export function errorResponse(
  code: string,
  message: string,
  statusCode: number = 500
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    { status: statusCode }
  );
}

export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  if (error instanceof AppError) {
    return errorResponse(error.code, error.message, error.statusCode);
  }

  if (error instanceof ZodError) {
    const message = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    return errorResponse('VALIDATION_ERROR', message, 400);
  }

  if (error instanceof Error) {
    console.error('Unhandled error:', error);
    return errorResponse('INTERNAL_ERROR', error.message, 500);
  }

  console.error('Unknown error:', error);
  return errorResponse('INTERNAL_ERROR', 'An unknown error occurred', 500);
}

const CORS_METHOD_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function parseAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

export function getCorsHeaders(request: Request | null = null): Record<string, string> {
  const allowed = parseAllowedOrigins();
  if (allowed.length === 0) {
    if (process.env.NODE_ENV !== 'production') {
      return { 'Access-Control-Allow-Origin': '*', ...CORS_METHOD_HEADERS };
    }
    return {};
  }
  const origin = request?.headers.get('origin') ?? null;
  if (origin && allowed.includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', ...CORS_METHOD_HEADERS };
  }
  return {};
}

export function optionsResponse(request: Request | null = null): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}
