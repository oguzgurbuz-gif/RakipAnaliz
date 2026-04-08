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
  report_week_start: Date
  report_week_end: Date
  executive_summary: string
  report_payload: Record<string, unknown>
  status: string
  created_at: Date
}

async function getWeeklyReportData(id: string) {
  const report = await queryOne<WeeklyReportRow>(`
    SELECT
      id,
      report_week_start,
      report_week_end,
      executive_summary,
      report_payload,
      status,
      created_at
    FROM weekly_reports
    WHERE id = $1
  `, [id])

  if (!report) {
    throw new NotFoundError('WeeklyReport', id)
  }

  const startDate = new Date(report.report_week_start)
  const oneJan = new Date(startDate.getFullYear(), 0, 1)
  const weekNumber = Math.ceil(((startDate.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7)

  const summary = report.report_payload ?? {}
  const bySite = (summary.by_site as Record<string, unknown>[]) ?? []
  const topBonuses = (summary.top_bonuses as Record<string, unknown>[]) ?? []

  const topSites = bySite.map((site: Record<string, unknown>) => ({
    siteName: site.siteCode as string,
    count: site.totalCampaigns as number,
  }))

  return {
    id: String(report.id),
    weekStart: report.report_week_start.toISOString(),
    weekEnd: report.report_week_end.toISOString(),
    weekNumber,
    year: startDate.getFullYear(),
    title: `Haftalık Rapor - ${startDate.toLocaleDateString('tr-TR')}`,
    executiveSummary: report.executive_summary ?? null,
    status: report.status,
    siteCoverageCount: summary.activeSites ?? 0,
    campaignCount: summary.totalCampaigns ?? 0,
    startedCount: summary.newCampaigns ?? 0,
    endedCount: summary.expiredCampaigns ?? 0,
    activeOverlapCount: summary.totalCampaigns ?? 0,
    changedCount: summary.updatedCampaigns ?? 0,
    passiveCount: 0,
    topCategories: [],
    topSites,
    risks: [],
    recommendations: [],
    createdAt: report.created_at.toISOString(),
    updatedAt: report.created_at.toISOString(),
    items: topBonuses.map((bonus: Record<string, unknown>, index: number) => ({
      id: String(index),
      type: 'top_bonus',
      order: index,
      title: bonus.title as string,
      body: `Site: ${bonus.siteCode} - Bonus: ${bonus.bonusAmount || bonus.bonusPercentage || 'N/A'}`,
      payload: bonus,
      createdAt: report.created_at.toISOString(),
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
