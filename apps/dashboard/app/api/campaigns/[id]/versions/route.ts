import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { successResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response';
import { NotFoundError } from '@bitalih/shared/errors';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type VersionRow = {
  id: string;
  campaign_id: string;
  version_no: number;
  title: string | null;
  body: string | null;
  valid_from: Date | null;
  valid_to: Date | null;
  diff_summary: unknown;
  created_at: Date;
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

    const versions = await query<VersionRow>(`
      SELECT 
        id, campaign_id, version_no, title, body,
        valid_from, valid_to, diff_summary, created_at
      FROM campaign_versions
      WHERE campaign_id = $1
      ORDER BY version_no DESC
    `, [id]);

    const result = versions.map((v: VersionRow) => ({
      id: v.id,
      campaignId: v.campaign_id,
      version: v.version_no,
      title: v.title,
      body: v.body,
      validFrom: v.valid_from ? v.valid_from.toISOString() : null,
      validTo: v.valid_to ? v.valid_to.toISOString() : null,
      diffSummary: v.diff_summary,
      createdAt: v.created_at ? v.created_at.toISOString() : null,
    }));

    return successResponse(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return handleApiError(error);
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
