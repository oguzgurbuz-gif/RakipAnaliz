import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { successResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response';
import { NotFoundError } from '@bitalih/shared/errors';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type SimilarCampaignRow = {
  id: string;
  title: string;
  body: string | null;
  status: string;
  valid_from: Date | null;
  valid_to: Date | null;
  primary_image_url: string | null;
  site_name: string;
  site_code: string;
  similarity_score: number;
  similarity_reason: string | null;
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

    // Migration 022 — read the human-readable `reason` column when set,
    // otherwise fall back to the legacy `comparison_type` enum so older
    // rows still render something useful in the dashboard.
    const rows = await query<SimilarCampaignRow>(`
      SELECT
        c.id,
        c.title,
        c.body,
        c.status,
        c.valid_from,
        c.valid_to,
        c.primary_image_url,
        s.name as site_name,
        s.code as site_code,
        cs.similarity_score,
        COALESCE(cs.reason, cs.comparison_type) as similarity_reason
      FROM campaign_similarities cs
      JOIN campaigns c ON c.id = cs.campaign_id_2
      JOIN sites s ON s.id = c.site_id
      WHERE cs.campaign_id_1 = $1
      ORDER BY cs.similarity_score DESC
      LIMIT 20
    `, [id]);

    const similarCampaigns = rows.map((row: SimilarCampaignRow) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      status: row.status,
      validFrom: row.valid_from ? row.valid_from.toISOString() : null,
      validTo: row.valid_to ? row.valid_to.toISOString() : null,
      primaryImage: row.primary_image_url,
      site: {
        name: row.site_name,
        code: row.site_code,
      },
      similarityScore: row.similarity_score,
      similarityReason: row.similarity_reason,
    }));

    return successResponse(similarCampaigns);
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
