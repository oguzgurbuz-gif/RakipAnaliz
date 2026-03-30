import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { successResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response';
import { NotFoundError } from '@bitalih/shared/errors';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type StatusHistoryRow = {
  id: string;
  campaign_id: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  changed_at: Date;
  context: unknown;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = paramsSchema.parse(await params);

    const campaignCheck = await queryOne<{ id: string }>(
      'SELECT id FROM campaigns WHERE id = $1',
      [id]
    );

    if (!campaignCheck) {
      throw new NotFoundError('Campaign', id);
    }

    const statusHistory = await query<StatusHistoryRow>(`
      SELECT 
        id, campaign_id, previous_status, new_status,
        reason, changed_at, context
      FROM campaign_status_history
      WHERE campaign_id = $1
      ORDER BY changed_at DESC
    `, [id]);

    const result = statusHistory.map((h: StatusHistoryRow) => ({
      id: h.id,
      campaignId: h.campaign_id,
      previousStatus: h.previous_status,
      newStatus: h.new_status,
      reason: h.reason,
      changedAt: h.changed_at ? h.changed_at.toISOString() : null,
      context: h.context,
    }));

    return successResponse(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return handleApiError(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
