import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCorsHeaders } from '@/lib/response'

export async function GET(request: NextRequest) {
  try {
    const queueDepth = await query<{ count: string }>(`SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'`)
    const runningScrapeRuns = await query<{ count: string }>(`SELECT COUNT(*) as count FROM scrape_runs WHERE status = 'running'`)
    const completedScrapeRuns = await query<{ count: string }>(`SELECT COUNT(*) as count FROM scrape_runs WHERE status = 'completed'`)

    const scrapeRuns = await query(`
      SELECT id, site_id, status, started_at, completed_at,
             cards_found, new_campaigns, updated_campaigns, unchanged, errors
      FROM scrape_runs
      ORDER BY started_at DESC
      LIMIT 50
    `)

    const jobs = await query(`
      SELECT id, type, status, priority, attempts, max_attempts,
             scheduled_at, started_at, completed_at, error, created_at
      FROM jobs
      ORDER BY created_at DESC
      LIMIT 100
    `)

    return NextResponse.json({
      queueDepth: parseInt(queueDepth[0]?.count || '0', 10),
      runningScrapeRuns: parseInt(runningScrapeRuns[0]?.count || '0', 10),
      completedScrapeRuns: parseInt(completedScrapeRuns[0]?.count || '0', 10),
      scrapeRuns,
      jobs,
    })
  } catch (error) {
    console.error('Admin jobs API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: getCorsHeaders() })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}