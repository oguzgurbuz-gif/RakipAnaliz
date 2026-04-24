import { NextRequest, NextResponse } from 'next/server'
import { execute } from '@/lib/db'
import {
  successResponse,
  errorResponse,
  handleApiError,
  getCorsHeaders,
} from '@/lib/response'

/**
 * Mark notification(s) as read.
 *
 * Body:
 *   { id: string | number }                 — single
 *   { ids: Array<string | number> }         — batch
 *   { all: true }                           — mark every unread row read
 *
 * Returns: { affected: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      id?: string | number
      ids?: Array<string | number>
      all?: boolean
    }

    if (body.all === true) {
      const affected = await execute(
        `UPDATE notifications
            SET read_at = CURRENT_TIMESTAMP(6)
          WHERE read_at IS NULL`
      )
      return successResponse({ affected })
    }

    const ids: string[] = []
    if (body.id != null) ids.push(String(body.id))
    if (Array.isArray(body.ids)) {
      for (const v of body.ids) {
        if (v != null) ids.push(String(v))
      }
    }
    if (ids.length === 0) {
      return errorResponse(
        'VALIDATION_ERROR',
        'id, ids[] veya all=true gerekli',
        400
      )
    }

    const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(', ')
    const affected = await execute(
      `UPDATE notifications
          SET read_at = CURRENT_TIMESTAMP(6)
        WHERE id IN (${placeholders}) AND read_at IS NULL`,
      ids
    )
    return successResponse({ affected })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) })
}
