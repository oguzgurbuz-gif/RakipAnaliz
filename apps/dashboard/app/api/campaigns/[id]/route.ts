import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { successResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response';
import { NotFoundError } from '@bitalih/shared/errors';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type CampaignRow = {
  id: string;
  site_id: string;
  title: string;
  body: string | null;
  status: string;
  valid_from: Date | null;
  valid_to: Date | null;
  valid_from_source: string;
  valid_to_source: string;
  valid_from_confidence: number | null;
  valid_to_confidence: number | null;
  first_seen_at: Date;
  last_seen_at: Date;
  primary_image_url: string | null;
  fingerprint: string;
  metadata: unknown;
  site_name: string;
  site_code: string;
  created_at: Date;
  updated_at: Date;
};

type AIAnalysisRow = {
  id: string;
  campaign_id: string;
  sentiment_label: string | null;
  sentiment_score: number | null;
  category_code: string | null;
  category_confidence: number | null;
  summary_text: string | null;
  key_points: unknown | null;
  risk_flags: unknown | null;
  recommendation_text: string | null;
  model_provider: string | null;
  model_name: string | null;
  created_at: Date;
};

type StatusHistoryRow = {
  id: string;
  campaign_id: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  changed_at: Date;
  context: unknown;
};

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

type NoteRow = {
  id: string;
  campaign_id: string;
  author_name: string | null;
  note_text: string;
  note_type: string | null;
  is_pinned: boolean;
  created_at: Date;
  updated_at: Date;
};

type SimilarCampaignRow = {
  similar_id: string;
  similar_title: string;
  similar_status: string;
  similar_valid_from: Date | null;
  similar_valid_to: Date | null;
  similar_primary_image_url: string | null;
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

    const campaignQuery = `
      SELECT 
        c.id,
        c.site_id,
        c.title,
        c.body,
        c.status,
        c.valid_from,
        c.valid_to,
        c.valid_from_source,
        c.valid_to_source,
        c.valid_from_confidence,
        c.valid_to_confidence,
        c.first_seen_at,
        c.last_seen_at,
        c.primary_image_url,
        c.fingerprint,
        c.metadata,
        s.name as site_name,
        s.code as site_code,
        c.created_at,
        c.updated_at
      FROM campaigns c
      JOIN sites s ON s.id = c.site_id
      WHERE c.id = $1
    `;

    const campaign = await queryOne<CampaignRow>(campaignQuery, [id]);

    if (!campaign) {
      throw new NotFoundError('Campaign', id);
    }

    const [aiAnalyses, statusHistory, versions, notes, similarCampaigns] = await Promise.all([
      query<AIAnalysisRow>(`
        SELECT 
          id, campaign_id, sentiment_label, sentiment_score,
          category_code, category_confidence, summary_text,
          key_points, risk_flags, recommendation_text,
          model_provider, model_name, created_at
        FROM campaign_ai_analyses
        WHERE campaign_id = $1
        ORDER BY created_at DESC
        LIMIT 5
      `, [id]),

      query<StatusHistoryRow>(`
        SELECT 
          id, campaign_id, previous_status, new_status,
          reason, changed_at, context
        FROM campaign_status_history
        WHERE campaign_id = $1
        ORDER BY changed_at DESC
        LIMIT 20
      `, [id]),

      query<VersionRow>(`
        SELECT 
          id, campaign_id, version_no, title, body,
          valid_from, valid_to, diff_summary, created_at
        FROM campaign_versions
        WHERE campaign_id = $1
        ORDER BY version_no DESC
        LIMIT 20
      `, [id]),

      query<NoteRow>(`
        SELECT 
          id, campaign_id, author_name, note_text,
          note_type, is_pinned, created_at, updated_at
        FROM campaign_notes
        WHERE campaign_id = $1
        ORDER BY is_pinned DESC, created_at DESC
      `, [id]),

      query<SimilarCampaignRow>(`
        SELECT 
          cs.similar_campaign_id as similar_id,
          c.title as similar_title,
          c.status as similar_status,
          c.valid_from as similar_valid_from,
          c.valid_to as similar_valid_to,
          c.primary_image_url as similar_primary_image_url,
          s.name as site_name,
          s.code as site_code,
          cs.similarity_score,
          cs.similarity_reason
        FROM campaign_similarities cs
        JOIN campaigns c ON c.id = cs.similar_campaign_id
        JOIN sites s ON s.id = c.site_id
        WHERE cs.campaign_id = $1
        ORDER BY cs.similarity_score DESC
        LIMIT 10
      `, [id]),
    ]);

    const latestAI = aiAnalyses[0] || null;

    const result = {
      id: campaign.id,
      siteId: campaign.site_id,
      title: campaign.title,
      body: campaign.body,
      status: campaign.status,
      validFrom: campaign.valid_from ? campaign.valid_from.toISOString() : null,
      validTo: campaign.valid_to ? campaign.valid_to.toISOString() : null,
      validFromSource: campaign.valid_from_source,
      validToSource: campaign.valid_to_source,
      validFromConfidence: campaign.valid_from_confidence,
      validToConfidence: campaign.valid_to_confidence,
      firstSeen: campaign.first_seen_at ? campaign.first_seen_at.toISOString() : null,
      lastSeen: campaign.last_seen_at ? campaign.last_seen_at.toISOString() : null,
      primaryImage: campaign.primary_image_url,
      fingerprint: campaign.fingerprint,
      metadata: campaign.metadata,
      createdAt: campaign.created_at ? campaign.created_at.toISOString() : null,
      updatedAt: campaign.updated_at ? campaign.updated_at.toISOString() : null,
      site: {
        id: campaign.site_id,
        name: campaign.site_name,
        code: campaign.site_code,
      },
      latestAI: latestAI ? {
        id: latestAI.id,
        sentiment: latestAI.sentiment_label,
        sentimentScore: latestAI.sentiment_score,
        category: latestAI.category_code,
        categoryConfidence: latestAI.category_confidence,
        summary: latestAI.summary_text,
        keyPoints: latestAI.key_points,
        riskFlags: latestAI.risk_flags,
        recommendation: latestAI.recommendation_text,
        modelProvider: latestAI.model_provider,
        modelName: latestAI.model_name,
        analyzedAt: latestAI.created_at ? latestAI.created_at.toISOString() : null,
      } : null,
      statusHistory: statusHistory.map((h: StatusHistoryRow) => ({
        id: h.id,
        previousStatus: h.previous_status,
        newStatus: h.new_status,
        reason: h.reason,
        changedAt: h.changed_at ? h.changed_at.toISOString() : null,
        context: h.context,
      })),
      versions: versions.map((v: VersionRow) => ({
        id: v.id,
        version: v.version_no,
        title: v.title,
        body: v.body,
        validFrom: v.valid_from ? v.valid_from.toISOString() : null,
        validTo: v.valid_to ? v.valid_to.toISOString() : null,
        diffSummary: v.diff_summary,
        createdAt: v.created_at ? v.created_at.toISOString() : null,
      })),
      notes: notes.map((n: NoteRow) => ({
        id: n.id,
        authorName: n.author_name,
        noteText: n.note_text,
        noteType: n.note_type,
        isPinned: n.is_pinned,
        createdAt: n.created_at ? n.created_at.toISOString() : null,
        updatedAt: n.updated_at ? n.updated_at.toISOString() : null,
      })),
      similarCampaigns: similarCampaigns.map((s: SimilarCampaignRow) => ({
        id: s.similar_id,
        title: s.similar_title,
        status: s.similar_status,
        validFrom: s.similar_valid_from ? s.similar_valid_from.toISOString() : null,
        validTo: s.similar_valid_to ? s.similar_valid_to.toISOString() : null,
        primaryImage: s.similar_primary_image_url,
        site: {
          name: s.site_name,
          code: s.site_code,
        },
        similarityScore: s.similarity_score,
        similarityReason: s.similarity_reason,
      })),
    };

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

const updateCampaignSchema = z.object({
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
  body: z.string().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = paramsSchema.parse(await params);
    const body = await request.json();
    const data = updateCampaignSchema.parse(body);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.validFrom !== undefined) {
      updates.push(`valid_from = $${paramIndex++}`);
      values.push(data.validFrom);
    }

    if (data.validTo !== undefined) {
      updates.push(`valid_to = $${paramIndex++}`);
      values.push(data.validTo);
    }

    if (data.body !== undefined) {
      updates.push(`body = $${paramIndex++}`);
      values.push(data.body);
    }

    if (updates.length === 0) {
      return errorResponse('VALIDATION_ERROR', 'No valid fields to update', 400);
    }

    values.push(id);

    const updateQuery = `
      UPDATE campaigns
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING id, title, body, status, valid_from, valid_to, updated_at
    `;

    const result = await queryOne(updateQuery, values);

    if (!result) {
      throw new NotFoundError('Campaign', id);
    }

    const updatedCampaign = result as CampaignRow;

    return successResponse({
      id: updatedCampaign.id,
      title: updatedCampaign.title,
      body: updatedCampaign.body,
      status: updatedCampaign.status,
      validFrom: updatedCampaign.valid_from ? updatedCampaign.valid_from.toISOString() : null,
      validTo: updatedCampaign.valid_to ? updatedCampaign.valid_to.toISOString() : null,
      updatedAt: updatedCampaign.updated_at ? updatedCampaign.updated_at.toISOString() : null,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', error.errors[0].message, 400);
    }
    return handleApiError(error);
  }
}
