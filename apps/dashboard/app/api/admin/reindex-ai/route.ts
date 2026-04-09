import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { successResponse, createdResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response';
import { ValidationError, NotFoundError } from '@bitalih/shared/errors';

const reindexSchema = z.object({
  campaignIds: z.array(z.string().uuid()).min(1),
  analysisType: z.enum(['full', 'dates_only', 'sentiment_only']).default('full'),
  priority: z.number().int().min(0).max(100).default(50),
});

type JobRow = {
  id: string;
  job_type: string;
  payload: unknown;
  status: string;
  priority: number;
  created_at: Date;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignIds, analysisType, priority } = reindexSchema.parse(body);

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
      WHERE c.id = ANY($1)
    `, [campaignIds]);

    if (validCampaigns.length === 0) {
      throw new NotFoundError('Campaigns');
    }

    const notFoundIds = campaignIds.filter(
      (id: string) => !validCampaigns.find((c: { id: string }) => c.id === id)
    );

    const jobs: JobRow[] = [];

    if (validCampaigns.length > 0) {
      const jobPayloads = validCampaigns.map(c => `('ai-analysis', '${JSON.stringify({
        campaignId: c.id,
        title: c.title,
        description: c.body,
        termsUrl: null,
        termsText: null,
        priority: priority >= 75 ? 'high' : priority >= 25 ? 'medium' : 'low',
        validFrom: c.valid_from,
        validTo: c.valid_to,
      })}', 'pending', ${priority}, 3, NOW())`).join(', ');

      const result = await query<JobRow>(`
        INSERT INTO jobs (type, payload, status, priority, max_attempts, scheduled_at)
        VALUES ${jobPayloads}
        RETURNING id, type, payload, status, priority, created_at
      `);

      jobs.push(...result);
    }

    await query(`
      INSERT INTO sse_events (event_type, event_channel, payload)
      VALUES ('campaign.ai.reindex.started', $1, $2)
    `, ['bitalih:events', JSON.stringify({
      campaignCount: validCampaigns.length,
      notFoundCount: notFoundIds.length,
      notFoundIds,
      jobIds: jobs.map(j => j.id),
      analysisType,
      timestamp: new Date().toISOString(),
    })]);

    return createdResponse({
      jobsCreated: jobs.length,
      campaignsProcessed: validCampaigns.map((c: { id: string; title: string }) => ({ id: c.id, title: c.title })),
      message: `Queued AI reindex for ${jobs.length} campaign(s)`,
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
