import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response'

type AdminSiteRow = {
  id: string
  code: string
  name: string
  base_url: string
  is_active: number | boolean
  priority: number
  campaign_count: number | null
  last_scraped_at: string | null
  last_scrape_status: string | null
  last_scrape_error: string | null
  last_scrape_duration: number | null
}

export async function GET(_request: NextRequest) {
  try {
    const rows = await query<AdminSiteRow>(`
      SELECT
        id,
        code,
        name,
        base_url,
        is_active,
        priority,
        campaign_count,
        last_scraped_at,
        last_scrape_status,
        last_scrape_error,
        last_scrape_duration
      FROM sites
      ORDER BY is_active DESC, priority DESC, name ASC
    `)

    const sites = rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      baseUrl: row.base_url,
      isActive: row.is_active === 1 || row.is_active === true,
      priority: row.priority,
      campaignCount: row.campaign_count ?? 0,
      lastScrapedAt: row.last_scraped_at,
      lastScrapeStatus: row.last_scrape_status,
      lastScrapeError: row.last_scrape_error,
      lastScrapeDuration: row.last_scrape_duration,
    }))

    return successResponse(sites)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
