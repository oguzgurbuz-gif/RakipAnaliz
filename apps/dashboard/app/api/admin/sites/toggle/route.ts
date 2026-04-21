import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne } from '@/lib/db'
import { successResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response'
import { logRequestAction } from '@/lib/audit'

const toggleSchema = z.object({
  siteCode: z.string().min(1),
  isActive: z.boolean(),
})

type SiteRow = {
  id: string
  code: string
  name: string
  is_active: number | boolean
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { siteCode, isActive } = toggleSchema.parse(body)

    const before = await queryOne<SiteRow>(
      `SELECT id, code, name, is_active FROM sites WHERE code = $1`,
      [siteCode]
    )

    if (!before) {
      return errorResponse('NOT_FOUND', `Site not found: ${siteCode}`, 404)
    }

    const desiredFlag = isActive ? 1 : 0
    const previousFlag =
      before.is_active === 1 || before.is_active === true ? 1 : 0
    const noOp = desiredFlag === previousFlag

    if (!noOp) {
      await query(
        `UPDATE sites SET is_active = $1, updated_at = NOW() WHERE code = $2`,
        [desiredFlag, siteCode]
      )
    }

    await logRequestAction(request, {
      action: 'site.toggle',
      resourceType: 'site',
      resourceId: before.id,
      changes: {
        siteCode,
        siteName: before.name,
        previous: { isActive: previousFlag === 1 },
        next: { isActive: desiredFlag === 1 },
        noOp,
      },
    })

    return successResponse({
      siteCode,
      siteId: before.id,
      siteName: before.name,
      isActive: desiredFlag === 1,
      changed: !noOp,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
