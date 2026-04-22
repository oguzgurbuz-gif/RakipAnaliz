import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { successResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response'

/**
 * /api/calendar/press-events/:id/yoy
 *
 * Year-over-Year competitor activity for a single press event window.
 * Compares two windows of equal duration:
 *   - thisYear:  [event.start_date, event.end_date]
 *   - lastYear:  same window − 365 days
 *
 * For each window we compute:
 *   - campaignCount (kampanyalar başlangıç tarihine göre, valid_from)
 *   - topCategories (en çok hangi kategori açıldı)
 *   - topBonuses    (en yüksek 5 bonus_amount kampanyası)
 *
 * Used in the calendar event popover so Growth ekibi "geçen Ramazan rakipler
 * ne yaptı" sorusunu tek tıkla görebilsin.
 *
 * Public read-only endpoint.
 */

type EventRow = {
  id: number | string
  name: string
  event_type: string
  start_date: string | Date
  end_date: string | Date
}

type CampaignAggRow = {
  campaign_count: number | string
  category_breakdown: string | null
  top_bonuses: string | null
}

type TopCategory = { category: string; count: number }
type TopBonus = {
  campaign_id: string
  title: string
  site_code: string | null
  site_name: string | null
  bonus_amount: number | null
  category: string | null
}

type YoYWindow = {
  from: string
  to: string
  campaignCount: number
  topCategories: TopCategory[]
  topBonuses: TopBonus[]
}

export type PressEventYoY = {
  event: {
    id: number
    name: string
    event_type: string
    start_date: string
    end_date: string
  }
  thisYear: YoYWindow
  lastYear: YoYWindow
}

const aiCategoryExpr = `COALESCE(
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')), ''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')), ''),
  'unknown'
)`

function toIsoDate(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const d = String(value.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(value).slice(0, 10)
}

function shiftIsoYear(iso: string, years: number): string {
  // Date math respecting calendar — handles leap years gracefully.
  const [y, m, d] = iso.split('-').map((v) => parseInt(v, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCFullYear(dt.getUTCFullYear() + years)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

async function aggregateWindow(from: string, to: string): Promise<YoYWindow> {
  // Single round-trip: count + top 5 categories (CSV) + top 5 bonuses (JSON).
  // We aggregate in app-land for clarity rather than doing 3 SQL hops.
  type Row = {
    id: string
    title: string
    site_code: string | null
    site_name: string | null
    bonus_amount: string | number | null
    category: string | null
  }

  const rows = await query<Row>(
    `
    SELECT
      c.id,
      c.title,
      s.code AS site_code,
      s.name AS site_name,
      COALESCE(caa.bonus_amount, NULL) AS bonus_amount,
      ${aiCategoryExpr} AS category
    FROM campaigns c
    LEFT JOIN sites s ON s.id = c.site_id
    LEFT JOIN (
      SELECT campaign_id,
             MAX(bonus_amount) AS bonus_amount
      FROM campaign_ai_analyses
      GROUP BY campaign_id
    ) caa ON caa.campaign_id = c.id
    WHERE c.valid_from IS NOT NULL
      AND c.valid_from >= $1
      AND c.valid_from <= $2
    `,
    [from, to + ' 23:59:59']
  )

  const campaignCount = rows.length

  const catCounts = new Map<string, number>()
  for (const r of rows) {
    const cat = (r.category ?? 'unknown').toString()
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1)
  }
  const topCategories: TopCategory[] = Array.from(catCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }))

  const topBonuses: TopBonus[] = rows
    .map((r) => ({
      campaign_id: r.id,
      title: r.title,
      site_code: r.site_code,
      site_name: r.site_name,
      bonus_amount:
        r.bonus_amount === null || r.bonus_amount === undefined
          ? null
          : Number(r.bonus_amount),
      category: r.category,
    }))
    .filter((r) => r.bonus_amount !== null && r.bonus_amount > 0)
    .sort((a, b) => (b.bonus_amount ?? 0) - (a.bonus_amount ?? 0))
    .slice(0, 5)

  return {
    from,
    to,
    campaignCount,
    topCategories,
    topBonuses,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10)
    if (!Number.isFinite(id) || id <= 0) {
      return errorResponse('VALIDATION_ERROR', 'Invalid event id', 400)
    }

    const event = await queryOne<EventRow>(
      `
      SELECT id, name, event_type, start_date, end_date
      FROM press_events
      WHERE id = $1
      `,
      [id]
    )

    if (!event) {
      return errorResponse('NOT_FOUND', `Press event not found: ${id}`, 404)
    }

    const thisStart = toIsoDate(event.start_date)
    const thisEnd = toIsoDate(event.end_date)
    const lastStart = shiftIsoYear(thisStart, -1)
    const lastEnd = shiftIsoYear(thisEnd, -1)

    const [thisYear, lastYear] = await Promise.all([
      aggregateWindow(thisStart, thisEnd),
      aggregateWindow(lastStart, lastEnd),
    ])

    const data: PressEventYoY = {
      event: {
        id: Number(event.id),
        name: event.name,
        event_type: event.event_type,
        start_date: thisStart,
        end_date: thisEnd,
      },
      thisYear,
      lastYear,
    }

    return successResponse(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes("doesn't exist") ||
      message.includes('Unknown table') ||
      message.includes('press_events')
    ) {
      return errorResponse(
        'MIGRATION_PENDING',
        'press_events table missing — apply migration 019',
        503
      )
    }
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
