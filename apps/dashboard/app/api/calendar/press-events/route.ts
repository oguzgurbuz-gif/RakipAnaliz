import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response'

/**
 * /api/calendar/press-events?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns Türkiye press events (religious, sports, national, commercial)
 * whose [start_date, end_date] window overlaps the requested range.
 *
 * Used by the campaign calendar to overlay external context (Ramazan,
 * derbi, Black Friday vb.). Migration 019 — `press_events` table.
 *
 * Public: read-only, no auth. Mutations live under /api/admin/press-events/*.
 */

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  type: z
    .enum(['religious', 'sports', 'national', 'commercial', 'other'])
    .optional(),
})

type PressEventRow = {
  id: number | string
  name: string
  event_type: 'religious' | 'sports' | 'national' | 'commercial' | 'other'
  start_date: string | Date
  end_date: string | Date
  description: string | null
  country: string
  impact_score: number
}

export type PressEvent = {
  id: number
  name: string
  event_type: 'religious' | 'sports' | 'national' | 'commercial' | 'other'
  start_date: string
  end_date: string
  description: string | null
  country: string
  impact_score: number
}

function toIsoDate(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const d = String(value.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  // MySQL DATE comes back as 'YYYY-MM-DD' string already in most drivers.
  return String(value).slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const params = querySchema.parse(
      Object.fromEntries(new URLSearchParams(request.nextUrl.search))
    )

    // Default window: today − 30d → today + 365d. Bounded so the calendar
    // never paints the whole table.
    const today = new Date()
    const defFrom = new Date(today)
    defFrom.setDate(defFrom.getDate() - 30)
    const defTo = new Date(today)
    defTo.setDate(defTo.getDate() + 365)

    const from = params.from ?? defFrom.toISOString().slice(0, 10)
    const to = params.to ?? defTo.toISOString().slice(0, 10)

    // Overlap predicate — event window intersects [from, to].
    // (start_date <= to AND end_date >= from)
    const where: string[] = ['start_date <= $2', 'end_date >= $1']
    const args: unknown[] = [from, to]

    if (params.type) {
      where.push(`event_type = $${args.length + 1}`)
      args.push(params.type)
    }

    const rows = await query<PressEventRow>(
      `
      SELECT id, name, event_type, start_date, end_date,
             description, country, impact_score
      FROM press_events
      WHERE ${where.join(' AND ')}
      ORDER BY start_date ASC, impact_score DESC, name ASC
      `,
      args
    )

    const data: PressEvent[] = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      event_type: r.event_type,
      start_date: toIsoDate(r.start_date),
      end_date: toIsoDate(r.end_date),
      description: r.description ?? null,
      country: r.country,
      impact_score: Number(r.impact_score) || 0,
    }))

    return successResponse(data)
  } catch (error) {
    // Soft-fail: if the table is missing (migration 019 not applied yet),
    // return an empty list so the calendar UI keeps working.
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes("doesn't exist") ||
      message.includes('Unknown table') ||
      message.includes('press_events')
    ) {
      console.warn('press_events table missing — returning empty list')
      return NextResponse.json(
        { success: true, data: [] as PressEvent[] },
        { status: 200, headers: getCorsHeaders(request) }
      )
    }
    return handleApiError(error)
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) })
}
