import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { createdResponse, handleApiError, getCorsHeaders } from '@/lib/response';
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { siteCodes, runType, priority } = triggerSchema.parse(body);

    let sites: SiteRow[];

    if (siteCodes && siteCodes.length > 0) {
      const ph = siteCodes.map((_, i) => `$${i + 1}`).join(', ');
      sites = await query<SiteRow>(`
        SELECT id, code, name, base_url
        FROM sites
        WHERE code IN (${ph}) AND is_active = 1
      `, siteCodes);
    } else {
      sites = await query<SiteRow>(`
        SELECT id, code, name, base_url
        FROM sites
        WHERE is_active = 1
      `);
    }

    if (sites.length === 0) {
      throw new ValidationError('No active sites found matching the criteria');
    }

    let jobsCreated = 0;
    for (const site of sites) {
      await query(
        `INSERT INTO jobs (type, payload, status, priority, max_attempts, scheduled_at)
         VALUES ($1, CAST($2 AS JSON), 'pending', $3, 3, NOW())`,
        [
          'scrape',
          JSON.stringify({
            siteCode: site.code,
            siteId: site.id,
            siteName: site.name,
            runType,
            triggeredBy: 'admin',
            config: { baseUrl: site.base_url },
          }),
          priority,
        ]
      );
      jobsCreated += 1;
    }

    await query(
      `INSERT INTO scrape_runs (
        site_id, status, started_at, cards_found, new_campaigns, updated_campaigns, unchanged, errors
      ) VALUES (
        NULL, 'running', NOW(), 0, 0, 0, 0, $1
      )`,
      [`admin-trigger:${runType}:${sites.length}`]
    );

    await query(`
      INSERT INTO sse_events (event_type, event_channel, payload)
      VALUES ('scrape.run.triggered', $1, $2)
    `, [SSE_CHANNEL || 'bitalih:events', JSON.stringify({
      siteCount: sites.length,
      jobsCreated,
      timestamp: new Date().toISOString(),
    })]);

    return createdResponse({
      jobsCreated,
      sitesTriggered: sites.map(s => s.code),
      message: `Triggered scrape for ${jobsCreated} site(s)`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
