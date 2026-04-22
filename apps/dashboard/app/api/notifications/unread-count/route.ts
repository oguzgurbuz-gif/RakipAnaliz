import { NextRequest, NextResponse } from 'next/server'
import {
  successResponse,
  handleApiError,
  getCorsHeaders,
} from '@/lib/response'
import { getUnreadNotificationCount } from '@/lib/notifications'

/**
 * Lightweight unread count endpoint for the header bell badge. Polled at low
 * frequency (header refetchInterval) and never blocks SSE pushes.
 */
export async function GET(_request: NextRequest) {
  try {
    const { count, migrationPending } = await getUnreadNotificationCount()
    return successResponse({ count, migrationPending })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}
