import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCorsHeaders } from '@/lib/response'

export async function GET(request: NextRequest) {
  try {
    const queueDepth = await query<{ count: string }>(`SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'`)
    const runningScrapeRuns = await query<{ count: string }>(`SELECT COUNT(*) as count FROM scrape_runs WHERE status = 'running'`)
    const completedScrapeRuns = await query<{ count: string }>(`SELECT COUNT(*) as count FROM scrape_runs WHERE status = 'completed'`)

    const scrapeRuns = await query(`
      SELECT
        r.id,
        r.site_id,
        r.status,
        r.started_at,
        r.completed_at,
        r.cards_found,
        r.new_campaigns,
        r.updated_campaigns,
        r.unchanged,
        r.errors,
        r.run_type,
        r.trigger_source,
        r.total_sites,
        r.completed_sites,
        r.failed_sites,
        r.inserted_count,
        r.updated_count,
        s.name AS site_name,
        s.code AS site_code
      FROM scrape_runs r
      LEFT JOIN sites s ON s.id = r.site_id
      ORDER BY r.started_at DESC
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
    return NextResponse.json({
      queueDepth: 0,
      runningScrapeRuns: 0,
      completedScrapeRuns: 0,
      scrapeRuns: [],
      jobs: [],
      fallback: true,
    }, { headers: getCorsHeaders(request) })
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) })
}