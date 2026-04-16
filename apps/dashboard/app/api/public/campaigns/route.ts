import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { getCorsHeaders } from '@/lib/response';

const querySchema = z.object({
  site: z.string().optional(),
  category: z.string().optional(),
  sentiment: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

type CampaignRow = {
  id: string;
  site_id: string;
  title: string;
  status: string;
  valid_from: Date | null;
  valid_to: Date | null;
  first_seen_at: Date;
  last_seen_at: Date;
  primary_image_url: string | null;
  site_name: string;
  site_code: string;
  ai_sentiment_label: string | null;
  ai_category_code: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search));
    const params = querySchema.parse(searchParams);

    const { site, category, sentiment, limit } = params;

    const filterParams: unknown[] = [];
    let paramIndex = 1;

    let whereClause = 'WHERE 1=1';

    if (site) {
      whereClause += ` AND s.code = $${paramIndex}`;
      filterParams.push(site);
      paramIndex++;
    }

    if (category) {
      whereClause += ` AND COALESCE(
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')), ''),
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')), '')
      ) = $${paramIndex}`;
      filterParams.push(category);
      paramIndex++;
    }

    if (sentiment) {
      whereClause += ` AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.sentiment')), '') = $${paramIndex}`;
      filterParams.push(sentiment);
      paramIndex++;
    }

    const dataQuery = `
      SELECT 
        c.id,
        c.site_id,
        c.title,
        c.status,
        c.valid_from,
        c.valid_to,
        c.created_at as first_seen_at,
        c.last_seen_at,
        c.primary_image_url,
        s.name as site_name,
        s.code as site_code,
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.sentiment')) as ai_sentiment_label,
        COALESCE(
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')), ''),
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')), '')
        ) as ai_category_code
      FROM campaigns c
      JOIN sites s ON s.id = c.site_id
      ${whereClause}
      ORDER BY c.last_seen_at DESC
      LIMIT $${paramIndex}
    `;

    filterParams.push(limit);
    const rows = await query<CampaignRow>(dataQuery, filterParams);

    const campaigns = rows.map((row: CampaignRow) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      validFrom: row.valid_from ? row.valid_from.toISOString() : null,
      validTo: row.valid_to ? row.valid_to.toISOString() : null,
      site: {
        id: row.site_id,
        name: row.site_name,
        code: row.site_code,
      },
      sentiment: row.ai_sentiment_label,
      category: row.ai_category_code,
      image: row.primary_image_url,
      firstSeen: row.first_seen_at,
      lastSeen: row.last_seen_at,
    }));

    return NextResponse.json(
      {
        success: true,
        data: campaigns,
      },
      { headers: getCorsHeaders() }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          },
        },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    console.error('Public campaigns API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred',
        },
      },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}