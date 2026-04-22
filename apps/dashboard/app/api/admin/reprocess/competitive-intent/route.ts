import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { createdResponse, handleApiError, getCorsHeaders, successResponse } from '@/lib/response';
import { logRequestAction } from '@/lib/audit';

/**
 * Migration 018 — admin trigger + status endpoint for the
 * `competitive-intent` reprocess pipeline.
 *
 * POST: enqueue a `competitive-intent-reprocess` job. The scraper service
 * picks it up via its scheduler and the actual AI work happens out of band;
 * the cost guard (Wave 1 #1.6) protects against budget overruns inside
 * `callDeepSeek` so we don't gate on it here.
 *
 * GET: return the latest run row from `competitive_intent_reprocess_runs`
 * so the admin UI can poll progress without hitting the scraper directly.
 *
 * Auth: middleware enforces ADMIN_API_KEY for everything under /api/admin.
 */

interface ReprocessRunRow {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_campaigns: number;
  processed_count: number;
  succeeded_count: number;
  failed_count: number;
  acquisition_count: number;
  retention_count: number;
  brand_count: number;
  clearance_count: number;
  unknown_count: number;
  triggered_by: string | null;
  error_message: string | null;
  started_at: Date | string | null;
  updated_at: Date | string | null;
  completed_at: Date | string | null;
}

function serializeRun(row: ReprocessRunRow | null) {
  if (!row) return null;
  const toIso = (v: Date | string | null) =>
    v instanceof Date ? v.toISOString() : v ? String(v) : null;
  return {
    id: row.id,
    status: row.status,
    totalCampaigns: Number(row.total_campaigns),
    processedCount: Number(row.processed_count),
    succeededCount: Number(row.succeeded_count),
    failedCount: Number(row.failed_count),
    distribution: {
      acquisition: Number(row.acquisition_count),
      retention: Number(row.retention_count),
      brand: Number(row.brand_count),
      clearance: Number(row.clearance_count),
      unknown: Number(row.unknown_count),
    },
    triggeredBy: row.triggered_by,
    errorMessage: row.error_message,
    startedAt: toIso(row.started_at),
    updatedAt: toIso(row.updated_at),
    completedAt: toIso(row.completed_at),
  };
}

export async function POST(request: NextRequest) {
  try {
    // The job picks up *all* non-deleted campaigns by default. Optional
    // `campaignIds` body restricts the scope; useful for spot re-runs.
    let campaignIds: string[] | undefined;
    try {
      const body = await request.json();
      if (Array.isArray(body?.campaignIds)) {
        campaignIds = body.campaignIds.filter((x: unknown) => typeof x === 'string');
      }
    } catch {
      // No body / invalid JSON — proceed with full reprocess.
    }

    const payload = {
      triggeredBy: 'admin',
      ...(campaignIds && campaignIds.length > 0 ? { campaignIds } : {}),
    };

    await query(
      `INSERT INTO jobs (type, payload, status, priority, max_attempts, scheduled_at)
       VALUES ($1, CAST($2 AS JSON), 'pending', $3, 1, NOW())`,
      ['competitive-intent-reprocess', JSON.stringify(payload), 70]
    );

    // Surface a publish event so the SSE bus can echo "started".
    await query(
      `INSERT INTO sse_events (event_type, event_channel, payload)
       VALUES ('campaign.competitive_intent.reprocess.started', $1, $2)`,
      [
        'bitalih:events',
        JSON.stringify({
          campaignIds: campaignIds ?? null,
          timestamp: new Date().toISOString(),
        }),
      ]
    );

    await logRequestAction(request, {
      action: 'competitive_intent.reprocess',
      resourceType: 'campaign_ai_analyses',
      resourceId: null,
      changes: {
        campaignIds: campaignIds ?? null,
        scope: campaignIds && campaignIds.length > 0 ? 'subset' : 'all',
      },
    });

    return createdResponse({
      message: 'Competitive intent reprocess queued',
      scope: campaignIds && campaignIds.length > 0 ? 'subset' : 'all',
      campaignIds: campaignIds ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  try {
    // Latest run row, regardless of status. The admin UI polls this every
    // few seconds while a run is in flight. Tolerate the case where the
    // table doesn't exist yet (migration not applied) by returning null.
    let latest: ReprocessRunRow | null = null;
    try {
      latest = await queryOne<ReprocessRunRow>(
        `SELECT * FROM competitive_intent_reprocess_runs
         ORDER BY started_at DESC
         LIMIT 1`
      );
    } catch {
      latest = null;
    }
    return successResponse({
      latestRun: serializeRun(latest),
      migrationPending: latest === null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
