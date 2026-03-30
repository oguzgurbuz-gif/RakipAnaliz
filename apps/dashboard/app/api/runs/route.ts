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
  run_type: string;
  trigger_source: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  total_sites: number;
  completed_sites: number;
  failed_sites: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  metadata: unknown;
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
        sr.run_type,
        sr.trigger_source,
        sr.status,
        sr.started_at,
        sr.completed_at,
        sr.total_sites,
        sr.completed_sites,
        sr.failed_sites,
        sr.inserted_count,
        sr.updated_count,
        sr.skipped_count,
        sr.metadata,
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
      runType: row.run_type,
      triggerSource: row.trigger_source,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      totalSites: row.total_sites,
      completedSites: row.completed_sites,
      failedSites: row.failed_sites,
      insertedCount: row.inserted_count,
      updatedCount: row.updated_count,
      skippedCount: row.skipped_count,
      metadata: row.metadata,
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
