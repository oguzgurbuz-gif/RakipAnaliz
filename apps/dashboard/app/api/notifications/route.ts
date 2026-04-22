import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import {
  successResponse,
  handleApiError,
  getCorsHeaders,
} from '@/lib/response'
import { mapNotificationRow } from '@/lib/notifications'

/**
 * Wave 4 — unified notification list endpoint backing the header bell
 * dropdown and the /notifications page.
 *
 * Query params (all optional):
 *   - unread     '1' to filter rows where read_at IS NULL
 *   - includeArchived '1' to include archived rows (default excludes them)
 *   - severity   'low' | 'medium' | 'high' | 'critical'
 *   - type       any notification_type (smart_alert, momentum_shift, …)
 *   - from       ISO date / 'YYYY-MM-DD'
 *   - to         ISO date / 'YYYY-MM-DD'
 *   - page       integer >= 1 (default 1)
 *   - pageSize   integer 1..200 (default 20)
 */

const ALLOWED_SEVERITIES = new Set(['low', 'medium', 'high', 'critical'])

interface RawNotificationRow {
  id: string | number
  notification_type: string
  severity: string
  title: string
  message: string | null
  payload: unknown
  read_at: string | Date | null
  archived_at: string | Date | null
  source_table: string | null
  source_id: string | null
  link_url: string | null
  created_at: string | Date
}

function parsePositiveInt(
  value: string | null,
  fallback: number,
  max?: number
): number {
  if (!value) return fallback
  const n = parseInt(value, 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  if (max && n > max) return max
  return n
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const unread = searchParams.get('unread') === '1'
    const includeArchived = searchParams.get('includeArchived') === '1'
    const severity = searchParams.get('severity')
    const type = searchParams.get('type')
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const page = parsePositiveInt(searchParams.get('page'), 1)
    const pageSize = parsePositiveInt(searchParams.get('pageSize'), 20, 200)
    const offset = (page - 1) * pageSize

    const where: string[] = []
    const params: unknown[] = []
    let i = 1

    if (!includeArchived) {
      where.push('archived_at IS NULL')
    }
    if (unread) {
      where.push('read_at IS NULL')
    }
    if (severity && ALLOWED_SEVERITIES.has(severity)) {
      where.push(`severity = $${i++}`)
      params.push(severity)
    }
    if (type) {
      where.push(`notification_type = $${i++}`)
      params.push(type)
    }
    if (fromParam) {
      where.push(`created_at >= $${i++}`)
      params.push(fromParam)
    }
    if (toParam) {
      where.push(`created_at <= $${i++}`)
      params.push(toParam)
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    let rows: RawNotificationRow[] = []
    let total = 0
    let migrationPending = false

    try {
      const [items, countRows] = await Promise.all([
        query<RawNotificationRow>(
          `SELECT id, notification_type, severity, title, message, payload,
                  read_at, archived_at, source_table, source_id, link_url, created_at
             FROM notifications
             ${whereSql}
            ORDER BY created_at DESC, id DESC
            LIMIT $${i} OFFSET $${i + 1}`,
          [...params, pageSize, offset]
        ),
        query<{ c: number | string }>(
          `SELECT COUNT(*) AS c FROM notifications ${whereSql}`,
          params
        ),
      ])
      rows = items
      const c = countRows[0]?.c ?? 0
      total = typeof c === 'number' ? c : Number(c) || 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (
        message.includes("doesn't exist") ||
        message.includes('Unknown table')
      ) {
        migrationPending = true
      } else {
        throw error
      }
    }

    const data = rows.map(mapNotificationRow)
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0

    return successResponse(
      { items: data, migrationPending },
      { page, pageSize, total, totalPages }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
