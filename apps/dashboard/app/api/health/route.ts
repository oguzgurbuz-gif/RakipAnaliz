import { NextResponse } from 'next/server';
import { checkConnection, query } from '@/lib/db';
import { errorResponse, getCorsHeaders } from '@/lib/response';

const START_TIME = Date.now();

export async function GET() {
  try {
    const dbOk = await checkConnection();
    
    if (!dbOk) {
      return errorResponse('DATABASE_ERROR', 'Database connection failed', 503);
    }

    const lastScrapeResult = await query<{ latest_run: Date | null }>(`
      SELECT MAX(started_at) as latest_run FROM scrape_runs WHERE status = 'completed'
    `);

    const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);

    return NextResponse.json(
      {
        success: true,
        data: {
          status: 'ok',
          database: 'ok',
          version: process.env.npm_package_version || '1.0.0',
          uptime: uptimeSeconds,
          last_scrape: lastScrapeResult[0]?.latest_run || null,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 200, headers: getCorsHeaders() }
    );
  } catch (error) {
    console.error('Health check error:', error);
    return errorResponse('INTERNAL_ERROR', 'Health check failed', 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}