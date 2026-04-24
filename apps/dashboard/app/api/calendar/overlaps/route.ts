import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { getCorsHeaders } from '@/lib/response';

// /api/calendar/overlaps?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns days where 2+ campaigns from DIFFERENT sites START on the same
// day in the same category — i.e. competitive collisions worth surfacing.
// Category is derived from metadata.ai_analysis.category (with fallback to
// campaign_type) so it stays consistent with the campaigns list endpoint.

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

type OverlapRow = {
  start_date: string;
  category: string;
  sites: string;
  campaign_count: string;
};

export type CalendarOverlap = {
  date: string;
  category: string;
  sites: string[];
  campaign_count: number;
};

const aiCategoryExpr = `COALESCE(
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')), ''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')), ''),
  'unknown'
)`;

export async function GET(request: NextRequest) {
  try {
    const params = querySchema.parse(
      Object.fromEntries(new URLSearchParams(request.nextUrl.search))
    );

    // Default window: today → +90d. Bounded so we never accidentally scan
    // the whole table.
    const from = params.from ?? new Date().toISOString().slice(0, 10);
    const toDefault = new Date();
    toDefault.setDate(toDefault.getDate() + 90);
    const to = params.to ?? toDefault.toISOString().slice(0, 10);

    // Group by start day + category, gather DISTINCT site codes.
    // HAVING COUNT(DISTINCT site_id) >= 2 enforces "different sites".
    const rows = await query<OverlapRow>(
      `
      SELECT
        DATE_FORMAT(c.valid_from, '%Y-%m-%d') AS start_date,
        ${aiCategoryExpr} AS category,
        GROUP_CONCAT(DISTINCT s.code ORDER BY s.code SEPARATOR ',') AS sites,
        COUNT(DISTINCT c.id) AS campaign_count
      FROM campaigns c
      LEFT JOIN sites s ON s.id = c.site_id
      WHERE c.valid_from IS NOT NULL
        AND c.valid_from >= $1
        AND c.valid_from <= $2
      GROUP BY start_date, category
      HAVING COUNT(DISTINCT c.site_id) >= 2
      ORDER BY start_date ASC, category ASC
      `,
      [from, to]
    );

    const data: CalendarOverlap[] = rows.map((r) => ({
      date: r.start_date,
      category: r.category,
      sites: r.sites ? r.sites.split(',').filter(Boolean) : [],
      campaign_count: Number(r.campaign_count) || 0,
    }));

    // Intentionally no `meta`: the dashboard fetchApi helper auto-unwraps
    // `data` when `meta` is absent, which keeps the consumer signature
    // simple (`CalendarOverlap[]` instead of an envelope).
    return NextResponse.json(
      { success: true, data },
      { headers: getCorsHeaders(request) }
    );
  } catch (error) {
    console.error('Calendar overlaps API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        data: [],
      },
      { status: 500, headers: getCorsHeaders(request) }
    );
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
