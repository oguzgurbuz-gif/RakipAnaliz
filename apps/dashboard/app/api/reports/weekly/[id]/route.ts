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
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = paramsSchema.parse(await params);

    const report = await queryOne<WeeklyReportRow>(`
      SELECT 
        id,
        period_start,
        period_end,
        summary,
        by_site,
        top_bonuses,
        status,
        generated_at
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
      executiveSummary: null,
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
      risks: [],
      recommendations: [],
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
