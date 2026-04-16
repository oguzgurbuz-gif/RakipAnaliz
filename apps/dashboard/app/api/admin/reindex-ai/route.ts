import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { createdResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response';
import { NotFoundError } from '@bitalih/shared/errors';

const reindexSchema = z.object({
  campaignIds: z.array(z.string().uuid()).min(1),
  analysisType: z.enum(['full', 'dates_only', 'sentiment_only']).default('full'),
  priority: z.number().int().min(0).max(100).default(50),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignIds, analysisType, priority } = reindexSchema.parse(body);

    const idPlaceholders = campaignIds.map((_, i) => `$${i + 1}`).join(', ');
    const validCampaigns = await query<{ 
      id: string; 
      title: string; 
      body: string | null; 
      site_name: string;
      valid_from: string | null;
      valid_to: string | null;
    }>(`
      SELECT c.id, c.title, c.body, s.name as site_name,
             c.valid_from, c.valid_to
      FROM campaigns c
      JOIN sites s ON s.id = c.site_id
      WHERE c.id IN (${idPlaceholders})
    `, campaignIds);

    if (validCampaigns.length === 0) {
      throw new NotFoundError('Campaigns');
    }

    const notFoundIds = campaignIds.filter(
      (id: string) => !validCampaigns.find((c: { id: string }) => c.id === id)
    );

    let jobsCreated = 0;
    for (const c of validCampaigns) {
      await query(
        `INSERT INTO jobs (type, payload, status, priority, max_attempts, scheduled_at)
         VALUES ($1, CAST($2 AS JSON), 'pending', $3, 3, NOW())`,
        [
          'ai-analysis',
          JSON.stringify({
            campaignId: c.id,
            title: c.title,
            description: c.body,
            termsUrl: null,
            termsText: null,
            priority: priority >= 75 ? 'high' : priority >= 25 ? 'medium' : 'low',
            validFrom: c.valid_from,
            validTo: c.valid_to,
          }),
          priority,
        ]
      );
      jobsCreated += 1;
    }

    await query(`
      INSERT INTO sse_events (event_type, event_channel, payload)
      VALUES ('campaign.ai.reindex.started', $1, $2)
    `, ['bitalih:events', JSON.stringify({
      campaignCount: validCampaigns.length,
      notFoundCount: notFoundIds.length,
      notFoundIds,
      jobsCreated,
      analysisType,
      timestamp: new Date().toISOString(),
    })]);

    return createdResponse({
      jobsCreated,
      campaignsProcessed: validCampaigns.map((c: { id: string; title: string }) => ({ id: c.id, title: c.title })),
      message: `Queued AI reindex for ${jobsCreated} campaign(s)`,
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
