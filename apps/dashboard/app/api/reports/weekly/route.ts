import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response';

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  from: z.string().optional(),
  to: z.string().optional(),
});

type WeeklyReportRow = {
  id: number;
  report_week_start: Date;
  report_week_end: Date;
  title: string;
  executive_summary: string;
  status: string;
  site_coverage_count: number;
  campaign_count: number;
  started_count: number;
  ended_count: number;
  active_overlap_count: number;
  changed_count: number;
  passive_count: number;
  created_at: Date;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search));
    const { page, pageSize, from, to } = querySchema.parse(searchParams);
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const filterValues: unknown[] = [];
    let placeholderIndex = 1;
    if (from) {
      conditions.push(`COALESCE(period_start, report_week_start) >= $${placeholderIndex++}`);
      filterValues.push(from);
    }
    if (to) {
      conditions.push(`COALESCE(period_end, report_week_end) <= $${placeholderIndex++}`);
      filterValues.push(to);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*) as total FROM weekly_reports ${whereClause}`,
      filterValues
    );
    const total = parseInt(countResult[0]?.total || '0', 10);

    const rows = await query<WeeklyReportRow>(
      `
      SELECT
        id,
        COALESCE(report_week_start, period_start) AS report_week_start,
        COALESCE(report_week_end, period_end) AS report_week_end,
        title,
        executive_summary,
        status,
        site_coverage_count,
        campaign_count,
        started_count,
        ended_count,
        active_overlap_count,
        changed_count,
        passive_count,
        created_at
      FROM weekly_reports
      ${whereClause}
      ORDER BY COALESCE(report_week_start, period_start) DESC
      LIMIT $${placeholderIndex} OFFSET $${placeholderIndex + 1}
      `,
      [...filterValues, pageSize, offset]
    );

    const reports = rows.map((row: WeeklyReportRow) => {
      const startDate = new Date(row.report_week_start);
      const endDate = new Date(row.report_week_end);
      const oneJan = new Date(startDate.getFullYear(), 0, 1);
      const weekNumber = Math.ceil(((startDate.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);

      return {
        id: String(row.id),
        weekStart: row.report_week_start,
        weekEnd: row.report_week_end,
        weekNumber,
        year: startDate.getFullYear(),
        title: row.title || `Haftalık Rapor - ${startDate.toLocaleDateString('tr-TR')}`,
        executiveSummary: row.executive_summary,
        status: row.status,
        siteCoverageCount: row.site_coverage_count,
        campaignCount: row.campaign_count,
        startedCount: row.started_count,
        endedCount: row.ended_count,
        activeOverlapCount: row.active_overlap_count,
        changedCount: row.changed_count,
        passiveCount: row.passive_count,
        createdAt: row.created_at,
        updatedAt: row.created_at,
      };
    });

    return successResponse(
      reports,
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

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
