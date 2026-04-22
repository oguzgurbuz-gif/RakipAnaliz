import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { execute, query } from '@/lib/db'
import { successResponse, createdResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response'
import { logRequestAction } from '@/lib/audit'

/**
 * Admin Press Events — list (GET) + create (POST).
 *
 * Auth: middleware guards /api/admin/* via x-admin-key or admin_session.
 *
 * GET  /api/admin/press-events?type=&year=
 * POST /api/admin/press-events  (body: { name, event_type, start_date, end_date, description?, impact_score? })
 */

const eventTypeEnum = z.enum(['religious', 'sports', 'national', 'commercial', 'other'])

const createSchema = z.object({
  name: z.string().min(1).max(255),
  event_type: eventTypeEnum,
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().nullable().optional(),
  country: z.string().min(2).max(8).default('TR'),
  impact_score: z.number().int().min(1).max(10).default(5),
  metadata: z.record(z.unknown()).nullable().optional(),
})

const listQuerySchema = z.object({
  type: eventTypeEnum.optional(),
  year: z.string().regex(/^\d{4}$/).optional(),
})

type Row = {
  id: number | string
  name: string
  event_type: string
  start_date: string | Date
  end_date: string | Date
  description: string | null
  country: string
  impact_score: number
  metadata: unknown
  created_at: string | Date
  updated_at: string | Date
}

function toIsoDate(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const d = String(value.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(value).slice(0, 10)
}

function shapeRow(r: Row) {
  return {
    id: Number(r.id),
    name: r.name,
    event_type: r.event_type,
    start_date: toIsoDate(r.start_date),
    end_date: toIsoDate(r.end_date),
    description: r.description,
    country: r.country,
    impact_score: Number(r.impact_score) || 0,
    metadata: r.metadata,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }
}

export async function GET(request: NextRequest) {
  try {
    const params = listQuerySchema.parse(
      Object.fromEntries(new URLSearchParams(request.nextUrl.search))
    )

    const where: string[] = []
    const args: unknown[] = []

    if (params.type) {
      args.push(params.type)
      where.push(`event_type = $${args.length}`)
    }
    if (params.year) {
      args.push(`${params.year}-01-01`)
      const fromIdx = args.length
      args.push(`${params.year}-12-31`)
      const toIdx = args.length
      // Event yıla giriyor mu? start <= year-end AND end >= year-start.
      where.push(`(start_date <= $${toIdx} AND end_date >= $${fromIdx})`)
    }

    const sql = `
      SELECT id, name, event_type, start_date, end_date,
             description, country, impact_score, metadata,
             created_at, updated_at
      FROM press_events
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY start_date ASC, impact_score DESC, name ASC
    `

    const rows = await query<Row>(sql, args)
    return successResponse(rows.map(shapeRow))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes("doesn't exist") ||
      message.includes('Unknown table') ||
      message.includes('press_events')
    ) {
      return successResponse([])
    }
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = createSchema.parse(body)

    if (parsed.start_date > parsed.end_date) {
      return errorResponse('VALIDATION_ERROR', 'start_date must be <= end_date', 400)
    }

    await execute(
      `
      INSERT INTO press_events
        (name, event_type, start_date, end_date, description, country, impact_score, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        parsed.name,
        parsed.event_type,
        parsed.start_date,
        parsed.end_date,
        parsed.description ?? null,
        parsed.country,
        parsed.impact_score,
        parsed.metadata ? JSON.stringify(parsed.metadata) : null,
      ]
    )

    // mysql2 doesn't return insertId from execute() helper — refetch by
    // (name, start_date) UNIQUE key.
    const rows = await query<Row>(
      `
      SELECT id, name, event_type, start_date, end_date,
             description, country, impact_score, metadata,
             created_at, updated_at
      FROM press_events
      WHERE name = $1 AND start_date = $2
      ORDER BY id DESC LIMIT 1
      `,
      [parsed.name, parsed.start_date]
    )
    const created = rows[0] ? shapeRow(rows[0]) : null

    if (created) {
      await logRequestAction(request, {
        action: 'press_event.create',
        resourceType: 'press_event',
        resourceId: String(created.id),
        changes: { next: created },
      })
    }

    return createdResponse(created)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
