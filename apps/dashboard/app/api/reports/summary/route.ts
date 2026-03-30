import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response';

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

type SummaryRow = {
  started_count: string;
  ended_count: string;
  active_count: string;
  passive_count: string;
  changed_count: string;
  category: string;
  category_count: string;
  site_name: string;
  site_count: string;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search));
    const { from, to } = querySchema.parse(searchParams);

    const dateFrom = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to) : new Date();

    const statusCounts = await query<{
      started_count: string;
      ended_count: string;
      active_count: string;
      passive_count: string;
      changed_count: string;
    }>(`
      SELECT 
        COUNT(CASE WHEN status = 'active' AND (valid_from >= $1 AND valid_from <= $2 OR (valid_from IS NULL AND first_seen_at >= $1 AND first_seen_at <= $2)) THEN 1 END) as started_count,
        COUNT(CASE WHEN status = 'active' AND valid_to >= $1 AND valid_to <= $2 THEN 1 END) as ended_count,
        COUNT(CASE WHEN status = 'active' AND (valid_from <= $2 AND (valid_to IS NULL OR valid_to >= $1) OR (valid_from IS NULL AND first_seen_at <= $2)) THEN 1 END) as active_count,
        COUNT(CASE WHEN status = 'pending' OR status = 'hidden' THEN 1 END) as passive_count,
        COUNT(CASE WHEN status = 'updated' AND updated_at >= $1 AND updated_at <= $2 THEN 1 END) as changed_count
      FROM campaigns
      WHERE (valid_from >= $1 AND valid_from <= $2)
         OR (valid_to >= $1 AND valid_to <= $2)
         OR (valid_from <= $2 AND (valid_to IS NULL OR valid_to >= $1))
         OR (updated_at >= $1 AND updated_at <= $2)
         OR (valid_from IS NULL AND first_seen_at >= $1 AND first_seen_at <= $2)
    `, [dateFrom, dateTo]);

    const topCategories = await query<{ category: string; count: string }>(`
      SELECT 
        COALESCE(ai.category_code, 'unknown') as category,
        COUNT(*) as count
      FROM campaigns c
      LEFT JOIN campaign_ai_analyses ai ON ai.campaign_id = c.id AND ai.id = (
        SELECT ai2.id FROM campaign_ai_analyses ai2 
        WHERE ai2.campaign_id = c.id 
        ORDER BY ai2.created_at DESC LIMIT 1
      )
      WHERE (c.valid_from >= $1 AND c.valid_from <= $2)
         OR (c.valid_from IS NULL AND c.first_seen_at >= $1 AND c.first_seen_at <= $2)
      GROUP BY COALESCE(ai.category_code, 'unknown')
      ORDER BY count DESC
      LIMIT 5
    `, [dateFrom, dateTo]);

    const topSites = await query<{ site_name: string; count: string }>(`
      SELECT 
        s.name as site_name,
        COUNT(*) as count
      FROM campaigns c
      JOIN sites s ON s.id = c.site_id
      WHERE (c.valid_from >= $1 AND c.valid_from <= $2)
         OR (c.valid_from IS NULL AND c.first_seen_at >= $1 AND c.first_seen_at <= $2)
      GROUP BY s.name
      ORDER BY count DESC
      LIMIT 5
    `, [dateFrom, dateTo]);

    const counts = statusCounts[0] || {
      started_count: '0',
      ended_count: '0',
      active_count: '0',
      passive_count: '0',
      changed_count: '0',
    };

    const result = {
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      startedCount: parseInt(counts.started_count || '0', 10),
      endedCount: parseInt(counts.ended_count || '0', 10),
      activeCount: parseInt(counts.active_count || '0', 10),
      passiveCount: parseInt(counts.passive_count || '0', 10),
      changedCount: parseInt(counts.changed_count || '0', 10),
      topCategories: topCategories.map((c: { category: string; count: string }) => ({
        category: c.category,
        count: parseInt(c.count, 10),
      })),
      topSites: topSites.map((s: { site_name: string; count: string }) => ({
        siteName: s.site_name,
        count: parseInt(s.count, 10),
      })),
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
