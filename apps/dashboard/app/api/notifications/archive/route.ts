import { NextRequest, NextResponse } from 'next/server'
import { execute } from '@/lib/db'
import {
  successResponse,
  errorResponse,
  handleApiError,
  getCorsHeaders,
} from '@/lib/response'

/**
 * Archive notification(s). Archived rows are excluded from the default list
 * and from the unread badge count.
 *
 * Body:
 *   { id: string | number }                 — single
 *   { ids: Array<string | number> }         — batch
 *
 * Returns: { affected: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      id?: string | number
      ids?: Array<string | number>
    }

    const ids: string[] = []
    if (body.id != null) ids.push(String(body.id))
    if (Array.isArray(body.ids)) {
      for (const v of body.ids) {
        if (v != null) ids.push(String(v))
      }
    }
    if (ids.length === 0) {
      return errorResponse('VALIDATION_ERROR', 'id veya ids[] gerekli', 400)
    }

    const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(', ')
    const affected = await execute(
      `UPDATE notifications
          SET archived_at = CURRENT_TIMESTAMP(6)
        WHERE id IN (${placeholders}) AND archived_at IS NULL`,
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
