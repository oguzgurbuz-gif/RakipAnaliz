import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCorsHeaders } from '@/lib/response';

export async function GET() {
  try {
    const sites = await query<{ id: string; name: string; code: string }>(`
      SELECT id, name, code
      FROM sites
      WHERE is_active = true
      ORDER BY priority DESC, name ASC
    `);

    return NextResponse.json(
      { success: true, data: sites },
      { headers: getCorsHeaders() }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { message: 'Failed to fetch sites' } },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
