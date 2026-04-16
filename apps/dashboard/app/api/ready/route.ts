import { NextResponse } from 'next/server';
import { getCorsHeaders } from '@/lib/response';

/**
 * Lightweight readiness endpoint for container health checks.
 * Intentionally avoids database calls so the web service can stay reachable
 * even when the database is temporarily unavailable.
 */
export async function GET() {
  return NextResponse.json(
    {
      success: true,
      data: {
        status: 'ready',
        timestamp: new Date().toISOString(),
      },
    },
    { status: 200, headers: getCorsHeaders() }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
