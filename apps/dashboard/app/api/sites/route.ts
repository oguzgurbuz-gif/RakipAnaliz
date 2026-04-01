import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { handleApiError, getCorsHeaders } from '@/lib/response';

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
    return handleApiError(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
