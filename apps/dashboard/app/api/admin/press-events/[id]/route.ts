import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { execute, query, queryOne } from '@/lib/db'
import { successResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response'
import { logRequestAction } from '@/lib/audit'

/**
 * Admin Press Events — single resource endpoints.
 *
 * GET    /api/admin/press-events/:id
 * PUT    /api/admin/press-events/:id
 * DELETE /api/admin/press-events/:id
 */

const eventTypeEnum = z.enum(['religious', 'sports', 'national', 'commercial', 'other'])

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  event_type: eventTypeEnum.optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().nullable().optional(),
  country: z.string().min(2).max(8).optional(),
  impact_score: z.number().int().min(1).max(10).optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
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

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseId(params.id)
    if (id === null) return errorResponse('VALIDATION_ERROR', 'Invalid id', 400)

    const row = await queryOne<Row>(
      `SELECT id, name, event_type, start_date, end_date,
              description, country, impact_score, metadata,
              created_at, updated_at
       FROM press_events WHERE id = $1`,
      [id]
    )

    if (!row) return errorResponse('NOT_FOUND', `Press event ${id} not found`, 404)
    return successResponse(shapeRow(row))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseId(params.id)
    if (id === null) return errorResponse('VALIDATION_ERROR', 'Invalid id', 400)

    const body = await request.json().catch(() => ({}))
    const patch = updateSchema.parse(body)

    const before = await queryOne<Row>(
      `SELECT id, name, event_type, start_date, end_date,
              description, country, impact_score, metadata,
              created_at, updated_at
       FROM press_events WHERE id = $1`,
      [id]
    )
    if (!before) return errorResponse('NOT_FOUND', `Press event ${id} not found`, 404)

    // Cross-field validation: if either date changes, ensure start <= end.
    const nextStart = patch.start_date ?? toIsoDate(before.start_date)
    const nextEnd = patch.end_date ?? toIsoDate(before.end_date)
    if (nextStart > nextEnd) {
      return errorResponse('VALIDATION_ERROR', 'start_date must be <= end_date', 400)
    }

    const updates: string[] = []
    const args: unknown[] = []
    function add(col: string, value: unknown) {
      args.push(value)
      updates.push(`${col} = $${args.length}`)
    }
    if (patch.name !== undefined) add('name', patch.name)
    if (patch.event_type !== undefined) add('event_type', patch.event_type)
    if (patch.start_date !== undefined) add('start_date', patch.start_date)
    if (patch.end_date !== undefined) add('end_date', patch.end_date)
    if (patch.description !== undefined) add('description', patch.description)
    if (patch.country !== undefined) add('country', patch.country)
    if (patch.impact_score !== undefined) add('impact_score', patch.impact_score)
    if (patch.metadata !== undefined) {
      add('metadata', patch.metadata === null ? null : JSON.stringify(patch.metadata))
    }

    if (updates.length === 0) {
      return successResponse(shapeRow(before))
    }

    args.push(id)
    await execute(
      `UPDATE press_events SET ${updates.join(', ')} WHERE id = $${args.length}`,
      args
    )

    const after = await queryOne<Row>(
      `SELECT id, name, event_type, start_date, end_date,
              description, country, impact_score, metadata,
              created_at, updated_at
       FROM press_events WHERE id = $1`,
      [id]
    )

    await logRequestAction(request, {
      action: 'press_event.update',
      resourceType: 'press_event',
      resourceId: String(id),
      changes: {
        previous: shapeRow(before),
        next: after ? shapeRow(after) : null,
      },
    })

    return successResponse(after ? shapeRow(after) : shapeRow(before))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseId(params.id)
    if (id === null) return errorResponse('VALIDATION_ERROR', 'Invalid id', 400)

    const before = await queryOne<Row>(
      `SELECT id, name, event_type, start_date, end_date,
              description, country, impact_score, metadata,
              created_at, updated_at
       FROM press_events WHERE id = $1`,
      [id]
    )
    if (!before) return errorResponse('NOT_FOUND', `Press event ${id} not found`, 404)

    await execute(`DELETE FROM press_events WHERE id = $1`, [id])

    await logRequestAction(request, {
      action: 'press_event.delete',
      resourceType: 'press_event',
      resourceId: String(id),
      changes: { previous: shapeRow(before) },
    })

    return successResponse({ id, deleted: true })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) })
}
