import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCorsHeaders } from '@/lib/response';

export async function GET(request: Request) {
  try {
    const sites = await query<{ id: string; name: string; code: string }>(`
      SELECT id, name, code
      FROM sites
      WHERE is_active = true
      ORDER BY priority DESC, name ASC
    `);

    return NextResponse.json(
      { success: true, data: sites },
      { headers: getCorsHeaders(request) }
    );
  } catch (error) {
    console.error('Sites API fallback:', error);
    return NextResponse.json(
      { success: true, data: [], fallback: true },
      { headers: getCorsHeaders(request) }
    );
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
