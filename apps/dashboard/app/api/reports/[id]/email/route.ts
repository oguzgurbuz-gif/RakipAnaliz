import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { queryOne } from '@/lib/db'
import { successResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response'
import { NotFoundError } from '@bitalih/shared/errors'
import nodemailer from 'nodemailer'
import { generateWeeklyReportPdf } from '@/lib/pdf/weekly-report-pdf'

const paramsSchema = z.object({
  id: z.string(),
})

const emailSchema = z.object({
  to: z.string().email(),
  subject: z.string().optional(),
  message: z.string().optional(),
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

  const summary = JSON.parse(report.summary || '{}')
  const bySite = JSON.parse(report.by_site || '[]')
  const topBonuses = JSON.parse(report.top_bonuses || '[]')

  const topSites = bySite.map((site: Record<string, unknown>) => ({
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
    createdAt: report.generated_at.toISOString(),
    updatedAt: report.generated_at.toISOString(),
    items: topBonuses.map((bonus: Record<string, unknown>, index: number) => ({
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = paramsSchema.parse(await params)
    const body = await request.json()
    const { to, subject, message } = emailSchema.parse(body)

    const reportData = await getWeeklyReportData(id)
    const pdfBuffer = generateWeeklyReportPdf(reportData)

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    const defaultSubject = `Bitalih Haftalık Rapor - ${reportData.year} Hafta ${reportData.weekNumber}`
    const defaultMessage = message || `
Haftalık raporunuz ekte.

Rapor Detayları:
- Hafta: ${reportData.weekNumber}, ${reportData.year}
- Dönem: ${new Date(reportData.weekStart).toLocaleDateString('tr-TR')} - ${new Date(reportData.weekEnd).toLocaleDateString('tr-TR')}
- Toplam Kampanya: ${reportData.campaignCount}
- Aktif Siteler: ${reportData.siteCoverageCount}

Bu email otomatik olarak gönderilmiştir.
    `.trim()

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@bitalih.com',
      to,
      subject: subject || defaultSubject,
      text: defaultMessage,
      attachments: [
        {
          filename: `haftalik-rapor-${reportData.year}-hafta-${reportData.weekNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    })

    return successResponse({ message: 'Report sent successfully' })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return errorResponse(error.code, error.message, error.statusCode)
    }
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', error.errors[0].message, 400)
    }
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
