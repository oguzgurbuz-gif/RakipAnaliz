import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response';

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().optional(),
  siteId: z.string().optional(),
});

type ScrapeRunRow = {
  id: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  cards_found: number | null;
  new_campaigns: number | null;
  updated_campaigns: number | null;
  unchanged: number | null;
  errors: string | null;
  site_name: string | null;
  site_code: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search));
    const { page, pageSize, status, siteId } = querySchema.parse(searchParams);
    const offset = (page - 1) * pageSize;

    const filterParams: unknown[] = [];
    let paramIndex = 1;
    let whereClause = '';

    if (status) {
      whereClause += ` WHERE sr.status = $${paramIndex}`;
      filterParams.push(status);
      paramIndex++;
    }

    if (siteId) {
      whereClause += whereClause ? ` AND sr.site_id = $${paramIndex}` : ` WHERE sr.site_id = $${paramIndex}`;
      filterParams.push(siteId);
      paramIndex++;
    }

    const countResult = await query<{ total: string }>(`
      SELECT COUNT(DISTINCT sr.id) as total
      FROM scrape_runs sr
      LEFT JOIN sites s ON s.id = sr.site_id
      ${whereClause}
    `, filterParams);
    const total = parseInt(countResult[0]?.total || '0', 10);

    const rows = await query<ScrapeRunRow>(`
      SELECT 
        sr.id,
        sr.status,
        sr.started_at,
        sr.completed_at,
        sr.cards_found,
        sr.new_campaigns,
        sr.updated_campaigns,
        sr.unchanged,
        sr.errors,
        s.name as site_name,
        s.code as site_code
      FROM scrape_runs sr
      LEFT JOIN sites s ON s.id = sr.site_id
      ${whereClause}
      ORDER BY sr.started_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...filterParams, pageSize, offset]);

    const runs = rows.map((row: ScrapeRunRow) => ({
      id: row.id,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      cardsFound: row.cards_found,
      newCampaigns: row.new_campaigns,
      updatedCampaigns: row.updated_campaigns,
      unchanged: row.unchanged,
      errors: row.errors,
      site: row.site_name ? {
        id: row.site_code,
        name: row.site_name,
      } : null,
    }));

    return successResponse(
      runs,
      {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
