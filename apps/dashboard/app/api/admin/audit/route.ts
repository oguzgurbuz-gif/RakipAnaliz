import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response'

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(100),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  actor: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})

type AuditRow = {
  id: string
  actor: string
  action: string
  resource_type: string
  resource_id: string | null
  changes: unknown
  ip: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search))
    const { page, pageSize, action, resourceType, actor, from, to } =
      querySchema.parse(searchParams)
    const offset = (page - 1) * pageSize

    const filters: unknown[] = []
    let i = 1
    const where: string[] = []
    if (action) {
      where.push(`action = $${i++}`)
      filters.push(action)
    }
    if (resourceType) {
      where.push(`resource_type = $${i++}`)
      filters.push(resourceType)
    }
    if (actor) {
      where.push(`actor = $${i++}`)
      filters.push(actor)
    }
    if (from) {
      where.push(`created_at >= $${i++}`)
      filters.push(from)
    }
    if (to) {
      where.push(`created_at <= $${i++}`)
      filters.push(to)
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    let total = 0
    let rows: AuditRow[] = []

    try {
      const countRes = await query<{ total: string | number }>(
        `SELECT COUNT(*) AS total FROM admin_logs ${whereClause}`,
        filters
      )
      total = countRes[0]
        ? typeof countRes[0].total === 'number'
          ? countRes[0].total
          : parseInt(String(countRes[0].total), 10)
        : 0

      rows = await query<AuditRow>(
        `SELECT id, actor, action, resource_type, resource_id, changes, ip, created_at
         FROM admin_logs
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${i++} OFFSET $${i++}`,
        [...filters, pageSize, offset]
      )
    } catch (innerError) {
      // Table may not exist yet (migration 015 not applied) — return empty rather than 500.
      const msg = innerError instanceof Error ? innerError.message : String(innerError)
      if (/admin_logs/i.test(msg) && /(doesn't exist|no such table|unknown)/i.test(msg)) {
        return successResponse(
          { items: [], migrationPending: true },
          { page, pageSize, total: 0, totalPages: 0 }
        )
      }
      throw innerError
    }

    const items = rows.map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      changes: row.changes,
      ip: row.ip,
      createdAt: row.created_at,
    }))

    return successResponse(
      { items, migrationPending: false },
      {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) })
}
