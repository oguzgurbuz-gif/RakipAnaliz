import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { successResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response';
import { NotFoundError, ValidationError } from '@bitalih/shared/errors';

const recalculateSchema = z.object({
  campaignIds: z.array(z.string().uuid()).min(1).max(1000),
});

type CampaignRow = {
  id: string;
  title: string;
  status: string;
  valid_from: Date | null;
  valid_to: Date | null;
  last_visible_at: Date | null;
  removed_from_source_at: Date | null;
  is_visible_on_last_scrape: boolean;
};

type StatusHistoryRow = {
  id: string;
  previous_status: string | null;
  new_status: string;
};

function calculateStatus(campaign: CampaignRow): string {
  const now = new Date();

  if (campaign.removed_from_source_at) {
    return 'removed';
  }

  if (!campaign.is_visible_on_last_scrape) {
    return 'hidden';
  }

  if (campaign.valid_to && new Date(campaign.valid_to) < now) {
    return 'expired';
  }

  if (campaign.valid_from && new Date(campaign.valid_from) > now) {
    return 'pending';
  }

  return 'active';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignIds } = recalculateSchema.parse(body);

    const campaigns = await query<CampaignRow>(`
      SELECT 
        id,
        title,
        status,
        valid_from,
        valid_to,
        last_visible_at,
        removed_from_source_at,
        is_visible_on_last_scrape
      FROM campaigns
      WHERE id = ANY($1)
    `, [campaignIds]);

    if (campaigns.length === 0) {
      throw new NotFoundError('Campaigns');
    }

    const notFoundIds = campaignIds.filter(
      (id: string) => !campaigns.find((c: CampaignRow) => c.id === id)
    );

    const results: {
      id: string;
      title: string;
      previousStatus: string;
      newStatus: string;
      changed: boolean;
    }[] = [];

    const changedIds: string[] = [];

    for (const campaign of campaigns) {
      const newStatus = calculateStatus(campaign);
      const changed = campaign.status !== newStatus;

      if (changed) {
        await query(`
          UPDATE campaigns
          SET status = $1, status_calculated_at = NOW()
          WHERE id = $2
        `, [newStatus, campaign.id]);

        await query(`
          INSERT INTO campaign_status_history (campaign_id, previous_status, new_status, reason, context)
          VALUES ($1, $2, $3, 'admin_recalc', $4)
        `, [campaign.id, campaign.status, newStatus, JSON.stringify({ triggeredBy: 'admin' })]);

        changedIds.push(campaign.id);
      }

      results.push({
        id: campaign.id,
        title: campaign.title,
        previousStatus: campaign.status,
        newStatus,
        changed,
      });
    }

    await query(`
      INSERT INTO sse_events (event_type, event_channel, payload)
      VALUES ('campaign.status.recalculated', $1, $2)
    `, ['bitalih:events', JSON.stringify({
      campaignCount: campaigns.length,
      changedCount: changedIds.length,
      changedIds,
      notFoundCount: notFoundIds.length,
      notFoundIds,
      timestamp: new Date().toISOString(),
    })]);

    return successResponse({
      campaignsProcessed: results.length,
      statusChanged: changedIds.length,
      campaigns: results,
      notFoundIds,
      message: `Recalculated status for ${results.length} campaign(s), ${changedIds.length} changed`,
    });
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
