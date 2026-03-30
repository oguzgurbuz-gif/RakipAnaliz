import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { successResponse, createdResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response';
import { ValidationError } from '@bitalih/shared/errors';

const SSE_CHANNEL = process.env.SSE_CHANNEL || 'bitalih:events';

const triggerSchema = z.object({
  siteCodes: z.array(z.string()).optional(),
  runType: z.enum(['scheduled', 'manual', 'full']).default('manual'),
  priority: z.number().int().min(0).max(100).default(50),
});

type SiteRow = {
  id: string;
  code: string;
  name: string;
  base_url: string;
};

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
    const { siteCodes, runType, priority } = triggerSchema.parse(body);

    let sites: SiteRow[];

    if (siteCodes && siteCodes.length > 0) {
      sites = await query<SiteRow>(`
        SELECT id, code, name, base_url
        FROM sites
        WHERE code = ANY($1) AND is_active = true
      `, [siteCodes]);
    } else {
      sites = await query<SiteRow>(`
        SELECT id, code, name, base_url
        FROM sites
        WHERE is_active = true
      `);
    }

    if (sites.length === 0) {
      throw new ValidationError('No active sites found matching the criteria');
    }

    const jobs: JobRow[] = [];

    for (const site of sites) {
      const result = await queryOne<JobRow>(`
        INSERT INTO jobs (type, payload, status, priority, max_attempts, scheduled_at)
        VALUES ('scrape', $1, 'pending', $2, 3, NOW())
        RETURNING id::text, type as job_type, payload, status, priority, created_at
      `, [
        JSON.stringify({
          siteCode: site.code,
          siteId: site.id,
          siteName: site.name,
          runType,
          triggeredBy: 'admin',
          config: {
            baseUrl: site.base_url,
          },
        }),
        priority,
      ]);

      if (result) {
        jobs.push(result);
      }
    }

    const scrapeRun = await queryOne<{ id: string }>(`
      INSERT INTO scrape_runs (run_type, trigger_source, status, total_sites)
      VALUES ($1, 'admin', 'running', $2)
      RETURNING id
    `, [runType, sites.length]);

    await query(`
      INSERT INTO sse_events (event_type, event_channel, payload)
      VALUES ('scrape.run.triggered', $1, $2)
    `, [SSE_CHANNEL || 'bitalih:events', JSON.stringify({
      scrapeRunId: scrapeRun?.id,
      siteCount: sites.length,
      jobIds: jobs.map(j => j.id),
      timestamp: new Date().toISOString(),
    })]);

    return createdResponse({
      scrapeRunId: scrapeRun?.id,
      jobsCreated: jobs.length,
      sitesTriggered: sites.map(s => s.code),
      message: `Triggered scrape for ${jobs.length} site(s)`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
