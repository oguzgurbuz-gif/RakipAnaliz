import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { createdResponse, handleApiError, getCorsHeaders, successResponse } from '@/lib/response';
import { logRequestAction } from '@/lib/audit';

/**
 * Migration 022 — admin trigger + status endpoint for the
 * `similarity-recalc` job (apps/scraper/src/jobs/similarity-calc.ts).
 *
 * POST: enqueue a `similarity-recalc` job. The scraper picks it up via its
 * scheduler and the work is fully local (TF-IDF cosine + category + bonus +
 * tag Jaccard) — no AI calls, no cost-guard interaction.
 *
 * GET: latest queued/completed similarity-recalc job row from `jobs` so the
 * admin UI can surface "last ran X minutes ago" and the persisted result.
 *
 * Auth: middleware enforces ADMIN_API_KEY for everything under /api/admin.
 */

interface SimilarityJobRow {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result: string | null;
  error: string | null;
  scheduled_at: Date | string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
}

interface SimilaritySummaryRow {
  total_pairs: string | number;
  average_score: string | number | null;
}

function serializeJob(row: SimilarityJobRow | null) {
  if (!row) return null;
  const toIso = (v: Date | string | null) =>
    v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : null;
  let parsedResult: Record<string, unknown> | null = null;
  if (row.result) {
    try {
      parsedResult = JSON.parse(row.result) as Record<string, unknown>;
    } catch {
      parsedResult = null;
    }
  }
  return {
    id: String(row.id),
    status: row.status,
    result: parsedResult,
    error: row.error,
    scheduledAt: toIso(row.scheduled_at),
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
  };
}

export async function POST(request: NextRequest) {
  try {
    await query(
      `INSERT INTO jobs (type, payload, status, priority, max_attempts, scheduled_at)
       VALUES ($1, CAST($2 AS JSON), 'pending', $3, 1, NOW())`,
      ['similarity-recalc', JSON.stringify({ triggeredBy: 'admin' }), 70]
    );

    await query(
      `INSERT INTO sse_events (event_type, event_channel, payload)
       VALUES ('campaign.similarity.recalc.started', $1, $2)`,
      [
        'bitalih:events',
        JSON.stringify({ timestamp: new Date().toISOString() }),
      ]
    );

    await logRequestAction(request, {
      action: 'similarity.recalc',
      resourceType: 'campaign_similarities',
      resourceId: null,
      changes: { scope: 'all' },
    });

    return createdResponse({
      message: 'Similarity recalculation queued',
      scope: 'all',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  try {
    let latest: SimilarityJobRow | null = null;
    try {
      latest = await queryOne<SimilarityJobRow>(
        `SELECT id, status, result, error, scheduled_at, started_at, completed_at
           FROM jobs
          WHERE type = 'similarity-recalc'
          ORDER BY scheduled_at DESC
          LIMIT 1`
      );
    } catch {
      latest = null;
    }

    let summary: SimilaritySummaryRow | null = null;
    try {
      summary = await queryOne<SimilaritySummaryRow>(
        `SELECT COUNT(*) AS total_pairs, AVG(similarity_score) AS average_score
           FROM campaign_similarities`
      );
    } catch {
      summary = null;
    }

    return successResponse({
      latestRun: serializeJob(latest),
      summary: summary
        ? {
            totalPairs: Number(summary.total_pairs ?? 0),
            averageScore:
              summary.average_score === null ? null : Number(summary.average_score),
          }
        : { totalPairs: 0, averageScore: null },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
