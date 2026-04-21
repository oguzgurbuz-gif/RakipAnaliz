import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { successResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response';
import { NotFoundError } from '@bitalih/shared/errors';

const paramsSchema = z.object({
  id: z.string().uuid({ message: 'Invalid report ID format' }),
});

type WeeklyReportRow = {
  id: string;
  period_start: Date;
  period_end: Date;
  summary: string;
  by_site: string;
  top_bonuses: string;
  status: string;
  generated_at: Date;
  executive_summary: string | null;
  risks: string | string[] | null;
  recommendations: string | string[] | null;
};

function parseStringArray(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === 'string');
      }
    } catch {
      return [];
    }
  }
  return [];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = paramsSchema.parse(await params);

    const report = await queryOne<WeeklyReportRow>(`
      SELECT
        id,
        COALESCE(period_start, report_week_start) AS period_start,
        COALESCE(period_end, report_week_end) AS period_end,
        summary,
        by_site,
        top_bonuses,
        status,
        COALESCE(generated_at, created_at) AS generated_at,
        executive_summary,
        risks,
        recommendations
      FROM weekly_reports
      WHERE id = $1
    `, [id]);

    if (!report) {
      throw new NotFoundError('WeeklyReport', id);
    }

    const startDate = new Date(report.period_start);
    const oneJan = new Date(startDate.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((startDate.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);

    const summary = JSON.parse(report.summary || '{}');
    const bySite = JSON.parse(report.by_site || '[]');
    const topBonuses = JSON.parse(report.top_bonuses || '[]');

    const topSites = bySite.map((site: Record<string, unknown>) => ({
      siteName: site.siteCode as string,
      count: site.totalCampaigns as number,
    }));

    const result = {
      id: String(report.id),
      weekStart: report.period_start,
      weekEnd: report.period_end,
      weekNumber,
      year: startDate.getFullYear(),
      title: `Haftalık Rapor - ${startDate.toLocaleDateString('tr-TR')}`,
      executiveSummary: report.executive_summary ?? null,
      status: report.status,
      siteCoverageCount: summary.activeSites || 0,
      campaignCount: summary.totalCampaigns || 0,
      startedCount: summary.newCampaigns || 0,
      endedCount: summary.expiredCampaigns || 0,
      activeOverlapCount: summary.totalCampaigns || 0,
      changedCount: summary.updatedCampaigns || 0,
      passiveCount: 0,
      topCategories: [],
      topSites,
      risks: parseStringArray(report.risks),
      recommendations: parseStringArray(report.recommendations),
      createdAt: report.generated_at,
      updatedAt: report.generated_at,
      items: topBonuses.map((bonus: Record<string, unknown>, index: number) => ({
        id: String(index),
        type: 'top_bonus',
        order: index,
        title: bonus.title as string,
        body: `Site: ${bonus.siteCode} - Bonus: ${bonus.bonusAmount || bonus.bonusPercentage || 'N/A'}`,
        payload: bonus,
        createdAt: report.generated_at,
      })),
    };

    return successResponse(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return handleApiError(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
