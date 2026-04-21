import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { errorResponse, getCorsHeaders, handleApiError } from '@/lib/response';

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  format: z.enum(['csv']).default('csv'),
});

type WeeklyReportExportRow = {
  id: string;
  period_start: Date | string | null;
  period_end: Date | string | null;
  report_week_start: Date | string | null;
  report_week_end: Date | string | null;
  title: string | null;
  status: string | null;
  campaign_count: number | null;
  site_coverage_count: number | null;
  started_count: number | null;
  ended_count: number | null;
  changed_count: number | null;
  active_overlap_count: number | null;
  passive_count: number | null;
  executive_summary: string | null;
  summary: string | null;
  generated_at: Date | string | null;
  created_at: Date | string;
};

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDate(value: Date | string | null): string {
  if (!value) return '';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function safeParseSummary(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function pickNumber(...candidates: Array<unknown>): number {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
    if (typeof c === 'string' && c.trim() !== '' && !Number.isNaN(Number(c))) {
      return Number(c);
    }
  }
  return 0;
}

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(new URLSearchParams(request.nextUrl.search));
    const { from, to, format } = querySchema.parse(params);

    if (format !== 'csv') {
      return errorResponse('VALIDATION_ERROR', `Unsupported format: ${format}`, 400);
    }

    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (from) {
      conditions.push(`COALESCE(period_start, report_week_start) >= $${i++}`);
      values.push(from);
    }
    if (to) {
      conditions.push(`COALESCE(period_end, report_week_end) <= $${i++}`);
      values.push(to);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query<WeeklyReportExportRow>(
      `SELECT
        id,
        period_start,
        period_end,
        report_week_start,
        report_week_end,
        title,
        status,
        campaign_count,
        site_coverage_count,
        started_count,
        ended_count,
        changed_count,
        active_overlap_count,
        passive_count,
        executive_summary,
        summary,
        generated_at,
        created_at
       FROM weekly_reports
       ${whereClause}
       ORDER BY COALESCE(period_start, report_week_start) DESC
       LIMIT 500`,
      values
    );

    const headers = [
      'id',
      'period_start',
      'period_end',
      'title',
      'status',
      'total_campaigns',
      'site_coverage',
      'started',
      'ended',
      'changed',
      'active_overlap',
      'passive',
      'executive_summary',
      'generated_at',
    ];

    const lines: string[] = [headers.join(',')];

    for (const row of rows) {
      const summary = safeParseSummary(row.summary);
      const totalCampaigns = pickNumber(
        row.campaign_count,
        summary?.totalCampaigns,
        summary?.campaignCount
      );
      const startedCount = pickNumber(
        row.started_count,
        summary?.newCampaigns,
        summary?.startedCount
      );
      const endedCount = pickNumber(
        row.ended_count,
        summary?.expiredCampaigns,
        summary?.endedCount
      );
      const changedCount = pickNumber(
        row.changed_count,
        summary?.updatedCampaigns,
        summary?.changedCount
      );
      const activeOverlap = pickNumber(
        row.active_overlap_count,
        summary?.totalCampaigns
      );
      const siteCoverage = pickNumber(
        row.site_coverage_count,
        summary?.activeSites
      );
      const passive = pickNumber(row.passive_count);

      lines.push(
        [
          csvEscape(row.id),
          csvEscape(formatDate(row.period_start ?? row.report_week_start)),
          csvEscape(formatDate(row.period_end ?? row.report_week_end)),
          csvEscape(row.title ?? ''),
          csvEscape(row.status ?? ''),
          csvEscape(totalCampaigns),
          csvEscape(siteCoverage),
          csvEscape(startedCount),
          csvEscape(endedCount),
          csvEscape(changedCount),
          csvEscape(activeOverlap),
          csvEscape(passive),
          csvEscape((row.executive_summary ?? '').replace(/\s+/g, ' ').trim()),
          csvEscape(
            row.generated_at
              ? new Date(row.generated_at).toISOString()
              : new Date(row.created_at).toISOString()
          ),
        ].join(',')
      );
    }

    const csvBody = '﻿' + lines.join('\r\n');
    const filename = `weekly-reports-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csvBody, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        ...getCorsHeaders(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', error.errors[0]?.message ?? 'Invalid query', 400);
    }
    return handleApiError(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
