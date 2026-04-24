import { NextResponse } from 'next/server';
import { getCorsHeaders } from '@/lib/response';

/**
 * Lightweight readiness endpoint for container health checks.
 * Intentionally avoids database calls so the web service can stay reachable
 * even when the database is temporarily unavailable.
 */
export async function GET(request: Request) {
  return NextResponse.json(
    {
      success: true,
      data: {
        status: 'ready',
        timestamp: new Date().toISOString(),
      },
    },
    { status: 200, headers: getCorsHeaders(request) }
  );
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
