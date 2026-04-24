import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCorsHeaders } from '@/lib/response';

export async function GET(request: Request) {
  try {
    const rows = await query<{
      id: string;
      name: string;
      code: string;
      is_priority: number;
    }>(`
      SELECT id, name, code, is_priority
      FROM sites
      WHERE is_active = true
      ORDER BY is_priority DESC, priority DESC, name ASC
    `);
    // MySQL TINYINT(1) returns 0/1 — surface a real boolean so the
    // frontend can use it with a plain truthy check.
    const sites = rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      is_priority: r.is_priority === 1,
    }));

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
