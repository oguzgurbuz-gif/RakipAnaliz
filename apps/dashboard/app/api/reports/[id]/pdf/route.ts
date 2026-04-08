import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { errorResponse, handleApiError, getCorsHeaders } from '@/lib/response'
import { NotFoundError } from '@bitalih/shared/errors'
import { z } from 'zod'
import { generateWeeklyReportPdf } from '@/lib/pdf/weekly-report-pdf'

const paramsSchema = z.object({
  id: z.string(),
})

type WeeklyReportRow = {
  id: number
  period_start: Date
  period_end: Date
  summary: string
  by_site: string
  top_bonuses: string
  status: string
  generated_at: Date
}

async function getWeeklyReportData(id: string) {
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
  `, [id])

  if (!report) {
    throw new NotFoundError('WeeklyReport', id)
  }

  const startDate = new Date(report.period_start)
  const oneJan = new Date(startDate.getFullYear(), 0, 1)
  const weekNumber = Math.ceil(((startDate.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7)

  let summary: Record<string, unknown> = {};
  let bySite: unknown[] = [];
  let topBonuses: unknown[] = [];

  try {
    summary = JSON.parse(report.summary || '{}');
  } catch {
    // Use empty object as fallback
  }

  try {
    bySite = JSON.parse(report.by_site || '[]');
  } catch {
    bySite = [];
  }

  try {
    topBonuses = JSON.parse(report.top_bonuses || '[]');
  } catch {
    topBonuses = [];
  }

  const topSites = (bySite as Record<string, unknown>[]).map((site: Record<string, unknown>) => ({
    siteName: site.siteCode as string,
    count: site.totalCampaigns as number,
  }))

  return {
    id: String(report.id),
    weekStart: report.period_start.toISOString(),
    weekEnd: report.period_end.toISOString(),
    weekNumber,
    year: startDate.getFullYear(),
    title: `Haftalık Rapor - ${startDate.toLocaleDateString('tr-TR')}`,
    executiveSummary: null,
    status: report.status,
    siteCoverageCount: (summary.activeSites as number) || 0,
    campaignCount: (summary.totalCampaigns as number) || 0,
    startedCount: (summary.newCampaigns as number) || 0,
    endedCount: (summary.expiredCampaigns as number) || 0,
    activeOverlapCount: (summary.totalCampaigns as number) || 0,
    changedCount: (summary.updatedCampaigns as number) || 0,
    passiveCount: 0,
    topCategories: [],
    topSites,
    risks: [],
    recommendations: [],
    createdAt: report.generated_at.toISOString(),
    updatedAt: report.generated_at.toISOString(),
    items: (topBonuses as Record<string, unknown>[]).map((bonus: Record<string, unknown>, index: number) => ({
      id: String(index),
      type: 'top_bonus',
      order: index,
      title: bonus.title as string,
      body: `Site: ${bonus.siteCode} - Bonus: ${bonus.bonusAmount || bonus.bonusPercentage || 'N/A'}`,
      payload: bonus,
      createdAt: report.generated_at.toISOString(),
    })),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = paramsSchema.parse(await params)
    const reportData = await getWeeklyReportData(id)

    const pdfBuffer = generateWeeklyReportPdf(reportData)
    const filename = `haftalik-rapor-${reportData.year}-hafta-${reportData.weekNumber}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
        ...getCorsHeaders(),
      },
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return errorResponse(error.code, error.message, error.statusCode)
    }
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
