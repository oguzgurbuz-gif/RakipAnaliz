import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { successResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response';
import { NotFoundError } from '@bitalih/shared/errors';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type ScrapeRunRow = {
  id: string;
  run_type: string;
  trigger_source: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  total_sites: number;
  completed_sites: number;
  failed_sites: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  metadata: unknown;
};

type ScrapeRunSiteRow = {
  id: string;
  scrape_run_id: string;
  site_id: string;
  status: string;
  started_at: Date | null;
  completed_at: Date | null;
  raw_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  retry_count: number;
  error_code: string | null;
  error_message: string | null;
  metrics: unknown;
  site_name: string;
  site_code: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = paramsSchema.parse(await params);

    const run = await queryOne<ScrapeRunRow>(`
      SELECT 
        id,
        run_type,
        trigger_source,
        status,
        started_at,
        completed_at,
        total_sites,
        completed_sites,
        failed_sites,
        inserted_count,
        updated_count,
        skipped_count,
        metadata
      FROM scrape_runs
      WHERE id = $1
    `, [id]);

    if (!run) {
      throw new NotFoundError('ScrapeRun', id);
    }

    const siteResults = await query<ScrapeRunSiteRow>(`
      SELECT 
        srs.id,
        srs.scrape_run_id,
        srs.site_id,
        srs.status,
        srs.started_at,
        srs.completed_at,
        srs.raw_count,
        srs.inserted_count,
        srs.updated_count,
        srs.skipped_count,
        srs.retry_count,
        srs.error_code,
        srs.error_message,
        srs.metrics,
        s.name as site_name,
        s.code as site_code
      FROM scrape_run_sites srs
      JOIN sites s ON s.id = srs.site_id
      WHERE srs.scrape_run_id = $1
      ORDER BY srs.started_at ASC
    `, [id]);

    const result = {
      id: run.id,
      runType: run.run_type,
      triggerSource: run.trigger_source,
      status: run.status,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      totalSites: run.total_sites,
      completedSites: run.completed_sites,
      failedSites: run.failed_sites,
      insertedCount: run.inserted_count,
      updatedCount: run.updated_count,
      skippedCount: run.skipped_count,
      metadata: run.metadata,
      siteResults: siteResults.map((sr: ScrapeRunSiteRow) => ({
        id: sr.id,
        siteId: sr.site_id,
        status: sr.status,
        startedAt: sr.started_at,
        completedAt: sr.completed_at,
        rawCount: sr.raw_count,
        insertedCount: sr.inserted_count,
        updatedCount: sr.updated_count,
        skippedCount: sr.skipped_count,
        retryCount: sr.retry_count,
        errorCode: sr.error_code,
        errorMessage: sr.error_message,
        metrics: sr.metrics,
        site: {
          id: sr.site_code,
          name: sr.site_name,
        },
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
