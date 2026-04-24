import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { getCorsHeaders } from '@/lib/response';

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // Internal admin tool — calendar/reports/gallery views legitimately need to
  // pull "all campaigns active in range" in a single request (e.g. limit:500
  // from /calendar, limit:1000 from /reports/summary). Keep the cap modest but
  // above those callers; without this the whole API silently returns
  // success:false → withFallback() yields [] and pages render blank.
  pageSize: z.coerce.number().int().positive().max(1000).default(20),
  siteId: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  campaign_type: z.string().optional(),
  // Legacy filter — kept for backward compatibility. New UI uses `intent`.
  sentiment: z.string().optional(),
  // Migration 018 — competitive_intent taxonomy filter.
  intent: z
    .enum(['acquisition', 'retention', 'brand', 'clearance', 'unknown'])
    .optional(),
  dateCompleteness: z.enum(['complete', 'missing_start', 'missing_end', 'missing_any']).optional(),
  dateMode: z.enum([
    'started_in_range',
    'ended_in_range',
    'active_during_range',
    'changed_in_range',
    'passive_in_range',
    'seen_in_range',
  ]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  sort: z.string().optional(),
});

type CampaignRow = {
  id: string;
  site_id: string;
  title: string;
  body: string | null;
  status: string;
  valid_from: Date | null;
  valid_to: Date | null;
  ai_valid_from: string | null;
  ai_valid_to: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  primary_image_url: string | null;
  fingerprint: string;
  metadata: Record<string, unknown> | null;
  site_name: string;
  site_code: string;
  ai_sentiment_label: string | null;
  ai_competitive_intent: string | null;
  ai_competitive_intent_confidence: number | null;
  ai_category_code: string | null;
  ai_summary_text: string | null;
  ai_key_points: unknown | null;
  ai_risk_flags: unknown | null;
};

const aiCategoryExpr = `COALESCE(
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')), ''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')), '')
)`;

function buildDateClause(dateMode?: string, from?: string, to?: string): { clause: string; params: unknown[] } {
  if (!dateMode || !from || !to) {
    return { clause: '', params: [] };
  }

  // Use string format directly to avoid timezone issues with Date objects
  const dateFrom = from;
  const dateTo = to;

  switch (dateMode) {
    case 'started_in_range':
      return {
        clause: 'AND c.valid_from >= $1 AND c.valid_from <= $2',
        params: [dateFrom, dateTo],
      };
    case 'ended_in_range':
      return {
        clause: 'AND c.valid_to >= $1 AND c.valid_to <= $2',
        params: [dateFrom, dateTo],
      };
    case 'active_during_range':
      return {
        clause: 'AND c.valid_from <= $2 AND (c.valid_to IS NULL OR c.valid_to >= $1)',
        params: [dateFrom, dateTo],
      };
    case 'changed_in_range':
      return {
        clause: 'AND c.updated_at >= $1 AND c.updated_at <= $2',
        params: [dateFrom, dateTo],
      };
    case 'seen_in_range':
      return {
        clause: 'AND c.last_seen_at >= $1 AND c.last_seen_at <= $2',
        params: [dateFrom, dateTo],
      };
    case 'passive_in_range':
      return {
        clause: `AND EXISTS (
      SELECT 1 FROM campaign_status_history h
      WHERE h.campaign_id = c.id
      AND h.new_status = 'passive'
      AND h.changed_at >= $1 AND h.changed_at <= $2
    )`,
        params: [dateFrom, dateTo],
      };
    default:
      return { clause: '', params: [] };
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search));
    const params = querySchema.parse(searchParams);

    const { page, pageSize, siteId, status, search, sort } = params;
    const offset = (page - 1) * pageSize;

    const dateFilter = buildDateClause(params.dateMode, params.from, params.to);
    const filterParams: unknown[] = [...dateFilter.params];
    let paramIndex = filterParams.length + 1;

    let whereClause = 'WHERE 1=1';

    if (siteId) {
      whereClause += ` AND c.site_id = $${paramIndex}`;
      filterParams.push(siteId);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND c.status = $${paramIndex}`;
      filterParams.push(status);
      paramIndex++;
    }

    if (params.category) {
      whereClause += ` AND ${aiCategoryExpr} = $${paramIndex}`;
      filterParams.push(params.category);
      paramIndex++;
    }

    if (params.campaign_type) {
      whereClause += ` AND JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')) = $${paramIndex}`;
      filterParams.push(params.campaign_type);
      paramIndex++;
    }

    if (params.sentiment) {
      whereClause += ` AND JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.sentiment')) = $${paramIndex}`;
      filterParams.push(params.sentiment);
      paramIndex++;
    }

    // Migration 018 — `intent` filter checks both the canonical
    // campaign_ai_analyses.competitive_intent column (latest row) AND the
    // mirrored value in campaigns.metadata.ai_analysis.competitive_intent.
    // The COALESCE keeps the filter resilient if one side has not yet been
    // backfilled by the reprocess job.
    if (params.intent) {
      whereClause += ` AND COALESCE(
        (SELECT ai.competitive_intent
           FROM campaign_ai_analyses ai
          WHERE ai.campaign_id = c.id
            AND ai.competitive_intent IS NOT NULL
          ORDER BY ai.created_at DESC
          LIMIT 1),
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.competitive_intent'))
      ) = $${paramIndex}`;
      filterParams.push(params.intent);
      paramIndex++;
    }

    if (params.dateCompleteness) {
      const hasStartDateExpr = `(c.valid_from IS NOT NULL OR NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.valid_from')), '') IS NOT NULL)`;
      const hasEndDateExpr = `(c.valid_to IS NOT NULL OR NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.valid_to')), '') IS NOT NULL)`;

      switch (params.dateCompleteness) {
        case 'complete':
          whereClause += ` AND ${hasStartDateExpr} AND ${hasEndDateExpr}`;
          break;
        case 'missing_start':
          whereClause += ` AND NOT ${hasStartDateExpr}`;
          break;
        case 'missing_end':
          whereClause += ` AND NOT ${hasEndDateExpr}`;
          break;
        case 'missing_any':
          whereClause += ` AND (NOT ${hasStartDateExpr} OR NOT ${hasEndDateExpr})`;
          break;
      }
    }

    if (search) {
      whereClause += ` AND (LOWER(c.title) LIKE LOWER($${paramIndex}) OR LOWER(IFNULL(c.body,'')) LIKE LOWER($${paramIndex}))`;
      filterParams.push(`%${search}%`);
      paramIndex++;
    }

    if (dateFilter.clause) {
      whereClause += ' ' + dateFilter.clause;
    }

    const validSortColumns = ['created_at', 'updated_at', 'valid_from', 'valid_to', 'title', 'status', 'last_seen_at', 'bonus_amount', 'duration'];
    const sortColumn = sort && validSortColumns.includes(sort) ? sort : 'created_at';
    const sortDirection = sortColumn.startsWith('-') ? 'ASC' : 'DESC';
    const sortCol = sortColumn.startsWith('-') ? sortColumn.slice(1) : sortColumn;

    const bonusAmountExpr = `JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.bonus_amount'))`;
    const durationExpr = `DATEDIFF(COALESCE(c.valid_to, NOW()), COALESCE(c.valid_from, c.created_at))`;

    const sortSql: Record<string, string> = {
      created_at: 'c.created_at',
      updated_at: 'c.updated_at',
      valid_from: 'c.valid_from',
      valid_to: 'c.valid_to',
      title: 'c.title',
      status: 'c.status',
      last_seen_at: 'c.last_seen_at',
      bonus_amount: `(${bonusAmountExpr} + 0)`,
      duration: durationExpr,
    };
    const orderCol = sortSql[sortCol === 'first_seen_at' ? 'created_at' : sortCol] || 'c.created_at';

    const countQuery = `
      SELECT COUNT(DISTINCT c.id) as total
      FROM campaigns c
      LEFT JOIN sites s ON s.id = c.site_id
      ${whereClause}
    `;

    const countResult = await query<{ total: string }>(countQuery, filterParams);
    const total = parseInt(countResult[0]?.total || '0', 10);

    // Migration 018 — pull the latest competitive_intent / confidence from
    // `campaign_ai_analyses` via a correlated subquery. We can't add this to
    // the main FROM as a JOIN easily because the row count would multiply
    // when older analyses also have non-null values; the subquery is
    // bounded to the most recent row per campaign.
    const dataQuery = `
      SELECT
        c.id,
        c.site_id,
        c.title,
        c.body,
        c.status,
        c.valid_from,
        c.valid_to,
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.valid_from')) as ai_valid_from,
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.valid_to')) as ai_valid_to,
        c.created_at as first_seen_at,
        c.last_seen_at,
        c.primary_image_url,
        c.fingerprint,
        c.metadata,
        s.name as site_name,
        s.code as site_code,
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.sentiment')) as ai_sentiment_label,
        COALESCE(
          (SELECT ai.competitive_intent
             FROM campaign_ai_analyses ai
            WHERE ai.campaign_id = c.id
              AND ai.competitive_intent IS NOT NULL
            ORDER BY ai.created_at DESC
            LIMIT 1),
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.competitive_intent')), '')
        ) as ai_competitive_intent,
        (SELECT ai.competitive_intent_confidence
           FROM campaign_ai_analyses ai
          WHERE ai.campaign_id = c.id
            AND ai.competitive_intent IS NOT NULL
          ORDER BY ai.created_at DESC
          LIMIT 1) as ai_competitive_intent_confidence,
        ${aiCategoryExpr} as ai_category_code,
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.summary')) as ai_summary_text,
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.key_points')) as ai_key_points,
        JSON_EXTRACT(c.metadata, '$.ai_analysis.risk_flags') as ai_risk_flags
      FROM campaigns c
      LEFT JOIN sites s ON s.id = c.site_id
      ${whereClause}
      ORDER BY ${orderCol} ${sortDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    filterParams.push(pageSize, offset);
    const rows = await query<CampaignRow>(dataQuery, filterParams);

    const campaigns = rows.map((row: CampaignRow) => ({
      id: row.id,
      siteId: row.site_id,
      title: row.title,
      body: row.body,
      status: row.status,
      validFrom: row.valid_from ? row.valid_from.toISOString() : null,
      validTo: row.valid_to ? row.valid_to.toISOString() : null,
      firstSeen: row.first_seen_at ? row.first_seen_at.toISOString() : null,
      lastSeen: row.last_seen_at ? row.last_seen_at.toISOString() : null,
      primaryImage: row.primary_image_url,
      fingerprint: row.fingerprint,
      metadata: row.metadata || {},
      site: {
        id: row.site_id,
        name: row.site_name,
        code: row.site_code,
      },
      sentiment: row.ai_sentiment_label,
      // Migration 018 — additive field. UI prefers competitiveIntent now.
      competitiveIntent: row.ai_competitive_intent,
      competitiveIntentConfidence:
        row.ai_competitive_intent_confidence !== null && row.ai_competitive_intent_confidence !== undefined
          ? Number(row.ai_competitive_intent_confidence)
          : null,
      category: row.ai_category_code,
      aiSummary: row.ai_summary_text,
      aiKeyPoints: row.ai_key_points,
      aiRiskFlags: row.ai_risk_flags,
    }));

    return NextResponse.json(
      {
        success: true,
        data: campaigns,
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
      { headers: getCorsHeaders(request) }
    );
  } catch (error) {
    console.error('Campaigns API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        data: [],
        meta: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        },
      },
      { status: 500, headers: getCorsHeaders(request) }
    );
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
