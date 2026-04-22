import { logger } from '../utils/logger';
import { getDb } from '../db';
import { BatchAnalysisCampaign, buildBatchAnalysisPrompt } from '../ai/prompts';
import { callDeepSeek } from '../ai/client';
import { CostLimitExceededError } from '../ai/cost-guard';
import { normalizeCompetitiveIntent, safeJsonParse } from '../ai/schema';
import * as queries from '../db/queries';
import type { BatchAnalysisResult } from './ai-analysis-batch';

/**
 * Migration 018 — re-process every campaign so the new competitive_intent
 * field is populated.
 *
 * Design notes
 * ------------
 * - Runs as a background task; the trigger API responds immediately and the
 *   job continues in the Node event loop. Progress is persisted to
 *   `competitive_intent_reprocess_runs` so the admin UI can poll status.
 * - Batches campaigns into groups of 25 to stay well within DeepSeek's token
 *   budget while keeping the round-trip count bounded for ~65 campaigns.
 * - Cost guard (Wave 1 #1.6) is enforced inside `callDeepSeek`; if the
 *   circuit breaker trips we mark the run as failed with a CostLimitExceeded
 *   error message rather than silently swallowing the breach.
 * - Each successful AI response inserts a fresh row into
 *   `campaign_ai_analyses` (rather than updating the latest), preserving the
 *   existing immutable-history pattern used by `insertAiAnalysis`.
 */

const REPROCESS_BATCH_SIZE = 25;

interface CampaignRow {
  id: string;
  title: string;
  body: string | null;
  site_code: string;
}

interface RunCounters {
  processed: number;
  succeeded: number;
  failed: number;
  acquisition: number;
  retention: number;
  brand: number;
  clearance: number;
  unknown: number;
}

function emptyCounters(): RunCounters {
  return {
    processed: 0,
    succeeded: 0,
    failed: 0,
    acquisition: 0,
    retention: 0,
    brand: 0,
    clearance: 0,
    unknown: 0,
  };
}

export interface StartReprocessOptions {
  triggeredBy?: string;
  /** Optional restriction; defaults to all non-deleted campaigns. */
  campaignIds?: string[];
}

export interface StartReprocessResult {
  runId: string;
  totalCampaigns: number;
  alreadyRunning: boolean;
}

/**
 * Returns the most recent run row, regardless of status. Used by the admin
 * status endpoint and to detect concurrent invocations.
 */
export async function getLatestReprocessRun(): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const result = await db.query(
    `SELECT * FROM competitive_intent_reprocess_runs
     ORDER BY started_at DESC
     LIMIT 1`
  );
  return result.rows[0] ?? null;
}

/**
 * Kick off a re-process. Returns immediately; AI work runs in the background.
 *
 * If a run is already in `pending` or `running` state we refuse to start a
 * new one and surface the existing run id so the caller can render progress
 * for the in-flight job. This keeps the admin button idempotent under double
 * clicks.
 */
export async function startCompetitiveIntentReprocess(
  options: StartReprocessOptions = {}
): Promise<StartReprocessResult> {
  const db = getDb();

  // Refuse to start a second concurrent run.
  const inflight = await db.query<{ id: string }>(
    `SELECT id FROM competitive_intent_reprocess_runs
     WHERE status IN ('pending', 'running')
     ORDER BY started_at DESC
     LIMIT 1`
  );
  if (inflight.rows.length > 0) {
    const existing = inflight.rows[0];
    const totalRow = await db.query<{ total_campaigns: number }>(
      `SELECT total_campaigns FROM competitive_intent_reprocess_runs WHERE id = $1`,
      [existing.id]
    );
    return {
      runId: String(existing.id),
      totalCampaigns: Number(totalRow.rows[0]?.total_campaigns ?? 0),
      alreadyRunning: true,
    };
  }

  const campaigns = await fetchCampaigns(options.campaignIds);

  await db.query(
    `INSERT INTO competitive_intent_reprocess_runs
       (status, total_campaigns, triggered_by)
     VALUES ($1, $2, $3)`,
    ['pending', campaigns.length, options.triggeredBy ?? null]
  );
  const idRow = await db.query<{ id: string }>(
    `SELECT id FROM competitive_intent_reprocess_runs
     ORDER BY started_at DESC LIMIT 1`
  );
  const runId = String(idRow.rows[0]?.id);

  // Fire and forget. Errors are caught inside runReprocess().
  void runReprocess(runId, campaigns).catch((err) => {
    logger.error('competitive_intent reprocess crashed', {
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return {
    runId,
    totalCampaigns: campaigns.length,
    alreadyRunning: false,
  };
}

async function fetchCampaigns(restrictTo?: string[]): Promise<CampaignRow[]> {
  const db = getDb();
  if (restrictTo && restrictTo.length > 0) {
    const placeholders = restrictTo.map((_, i) => `$${i + 1}`).join(', ');
    const result = await db.query(
      `SELECT c.id, c.title, c.body, s.code as site_code
         FROM campaigns c
         JOIN sites s ON s.id = c.site_id
        WHERE c.id IN (${placeholders})
          AND c.status != 'deleted'
        ORDER BY c.created_at DESC`,
      restrictTo
    );
    return result.rows as unknown as CampaignRow[];
  }

  const result = await db.query(
    `SELECT c.id, c.title, c.body, s.code as site_code
       FROM campaigns c
       JOIN sites s ON s.id = c.site_id
      WHERE c.status != 'deleted'
      ORDER BY c.created_at DESC`
  );
  return result.rows as unknown as CampaignRow[];
}

async function runReprocess(runId: string, campaigns: CampaignRow[]): Promise<void> {
  const db = getDb();
  await db.query(
    `UPDATE competitive_intent_reprocess_runs
        SET status = 'running'
      WHERE id = $1`,
    [runId]
  );

  const counters = emptyCounters();

  try {
    for (let i = 0; i < campaigns.length; i += REPROCESS_BATCH_SIZE) {
      const batch = campaigns.slice(i, i + REPROCESS_BATCH_SIZE);
      try {
        await processBatch(batch, counters);
      } catch (error) {
        if (error instanceof CostLimitExceededError) {
          logger.warn('competitive_intent reprocess paused by cost guard', {
            runId,
            processed: counters.processed,
          });
          await markFailed(runId, counters, `Cost guard tripped: ${error.message}`);
          return;
        }
        // Per-batch failures should not abort the whole run; tally and move on.
        logger.error('competitive_intent reprocess batch failed', {
          runId,
          batchSize: batch.length,
          error: error instanceof Error ? error.message : String(error),
        });
        counters.processed += batch.length;
        counters.failed += batch.length;
      }

      await persistProgress(runId, counters);
    }

    await db.query(
      `UPDATE competitive_intent_reprocess_runs
          SET status = 'completed',
              processed_count = $2,
              succeeded_count = $3,
              failed_count = $4,
              acquisition_count = $5,
              retention_count = $6,
              brand_count = $7,
              clearance_count = $8,
              unknown_count = $9,
              completed_at = NOW()
        WHERE id = $1`,
      [
        runId,
        counters.processed,
        counters.succeeded,
        counters.failed,
        counters.acquisition,
        counters.retention,
        counters.brand,
        counters.clearance,
        counters.unknown,
      ]
    );

    logger.info('competitive_intent reprocess completed', { runId, ...counters });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('competitive_intent reprocess failed', { runId, error: message });
    await markFailed(runId, counters, message);
  }
}

async function processBatch(batch: CampaignRow[], counters: RunCounters): Promise<void> {
  const promptCampaigns: BatchAnalysisCampaign[] = batch.map((c) => ({
    campaignId: String(c.id),
    title: String(c.title ?? ''),
    body: c.body ? String(c.body) : '',
    siteName: String(c.site_code ?? ''),
  }));

  const prompt = buildBatchAnalysisPrompt(promptCampaigns);
  const response = await callDeepSeek(prompt.messages, {
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty DeepSeek response');
  }

  let parsed = safeJsonParse<BatchAnalysisResult[]>(content);
  if (!parsed || !Array.isArray(parsed)) {
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      parsed = safeJsonParse<BatchAnalysisResult[]>(arrayMatch[0]);
    }
  }
  if (!parsed || !Array.isArray(parsed)) {
    throw new Error(`Failed to parse DeepSeek batch response: ${content.substring(0, 200)}`);
  }

  const resultsMap = new Map<string, BatchAnalysisResult>();
  for (const r of parsed) {
    resultsMap.set(r.campaign_id, r);
  }

  const db = getDb();
  for (const campaign of batch) {
    const id = String(campaign.id);
    const result = resultsMap.get(id);
    counters.processed += 1;

    if (!result) {
      counters.failed += 1;
      continue;
    }

    const intent = normalizeCompetitiveIntent(result.competitive_intent);
    const intentConfidence =
      typeof result.competitive_intent_confidence === 'number'
        ? result.competitive_intent_confidence
        : null;

    try {
      await queries.insertAiAnalysis(db, {
        campaignId: id,
        analysisType: 'competitive_intent_reprocess',
        sentimentLabel: null,
        sentimentScore: null,
        competitiveIntent: intent,
        competitiveIntentConfidence: intentConfidence,
        categoryCode: result.category ?? null,
        categoryConfidence: result.confidence ?? intentConfidence ?? null,
        summaryText: result.summary ?? null,
        keyPoints: result.key_points ?? [],
        minDeposit: result.min_deposit ?? null,
        maxBonus: result.max_bonus ?? null,
        turnover: result.turnover ?? null,
        freeBetAmount: result.free_bet_amount ?? null,
        cashbackPercent: result.cashback_percent ?? null,
        bonusAmount: result.bonus_amount ?? null,
        bonusPercentage: result.bonus_percentage ?? null,
        rawResponse: result as unknown as Record<string, unknown>,
        confidence: typeof result.confidence === 'number' ? result.confidence : undefined,
      });

      // Mirror into campaigns.metadata.ai_analysis so the dashboard
      // (which reads metadata for sentiment today) immediately reflects
      // the new field without waiting for a separate read path.
      await queries.updateCampaignAiAnalysis(db, id, {
        category: result.category ?? null,
        tags: JSON.stringify(result.key_points ?? []),
        sentiment: 'unknown',
        competitive_intent: intent,
        competitive_intent_confidence: intentConfidence,
        summary: result.summary,
      });

      counters.succeeded += 1;
      counters[intent] += 1;
    } catch (error) {
      counters.failed += 1;
      logger.warn('competitive_intent reprocess insert failed', {
        campaignId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function persistProgress(runId: string, counters: RunCounters): Promise<void> {
  const db = getDb();
  await db.query(
    `UPDATE competitive_intent_reprocess_runs
        SET processed_count = $2,
            succeeded_count = $3,
            failed_count = $4,
            acquisition_count = $5,
            retention_count = $6,
            brand_count = $7,
            clearance_count = $8,
            unknown_count = $9
      WHERE id = $1`,
    [
      runId,
      counters.processed,
      counters.succeeded,
      counters.failed,
      counters.acquisition,
      counters.retention,
      counters.brand,
      counters.clearance,
      counters.unknown,
    ]
  );
}

async function markFailed(runId: string, counters: RunCounters, message: string): Promise<void> {
  const db = getDb();
  await db.query(
    `UPDATE competitive_intent_reprocess_runs
        SET status = 'failed',
            processed_count = $2,
            succeeded_count = $3,
            failed_count = $4,
            acquisition_count = $5,
            retention_count = $6,
            brand_count = $7,
            clearance_count = $8,
            unknown_count = $9,
            error_message = $10,
            completed_at = NOW()
      WHERE id = $1`,
    [
      runId,
      counters.processed,
      counters.succeeded,
      counters.failed,
      counters.acquisition,
      counters.retention,
      counters.brand,
      counters.clearance,
      counters.unknown,
      message,
    ]
  );
}
