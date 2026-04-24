import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { successResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response'
import { logRequestAction } from '@/lib/audit'

type JobRow = {
  id: string
  type: string
  status: string
  attempts: number
  max_attempts: number
  error: string | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rawId = params.id
    if (!rawId) {
      return errorResponse('VALIDATION_ERROR', 'Missing job id', 400)
    }

    const job = await queryOne<JobRow>(
      `SELECT id, type, status, attempts, max_attempts, error FROM jobs WHERE id = $1`,
      [rawId]
    )

    if (!job) {
      return errorResponse('NOT_FOUND', `Job not found: ${rawId}`, 404)
    }

    if (job.status !== 'failed') {
      return errorResponse(
        'INVALID_STATE',
        `Only failed jobs can be retried (current status: ${job.status})`,
        409
      )
    }

    await query(
      `UPDATE jobs
         SET status = 'pending',
             attempts = 0,
             error = NULL,
             started_at = NULL,
             completed_at = NULL,
             scheduled_at = NOW(),
             available_at = NOW(),
             updated_at = NOW()
       WHERE id = $1`,
      [rawId]
    )

    await logRequestAction(request, {
      action: 'job.retry',
      resourceType: 'job',
      resourceId: String(job.id),
      changes: {
        jobId: job.id,
        jobType: job.type,
        previous: {
          status: job.status,
          attempts: job.attempts,
          error: job.error,
        },
        next: {
          status: 'pending',
          attempts: 0,
          error: null,
        },
      },
    })

    return successResponse({
      jobId: job.id,
      type: job.type,
      status: 'pending',
      attempts: 0,
      message: 'Job re-queued for retry',
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) })
}
