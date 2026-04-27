import { logger } from '../utils/logger';
import { getDb } from '../db';
import { BatchAnalysisCampaign, buildBatchAnalysisPrompt } from '../ai/prompts';
import { callDeepSeek } from '../ai/client';
import { normalizeCompetitiveIntent, safeJsonParse } from '../ai/schema';
import * as queries from '../db/queries';

export interface AiAnalysisBatchPayload {
  campaignIds: string[];
  priority?: 'low' | 'medium' | 'high';
}

export interface BatchAnalysisResult {
  campaign_id: string;
  category: string;
  /** Legacy. New AI calls return competitive_intent; kept optional for backward compat. */
  sentiment?: 'positive' | 'neutral' | 'negative';
  /** Migration 018 — growth-actionable taxonomy. */
  competitive_intent?: 'acquisition' | 'retention' | 'brand' | 'clearance' | 'unknown';
  competitive_intent_confidence?: number | null;
  summary: string;
  key_points: string[];
  min_deposit: number | null;
  max_bonus: number | null;
  turnover: string | null;
  free_bet_amount: number | null;
  cashback_percent: number | null;
  bonus_amount: number | null;
  bonus_percentage: number | null;
  confidence: number;
}

export interface AiAnalysisBatchResult {
  processed: number;
  successful: number;
  failed: number;
  results: Array<{ campaignId: string; success: boolean; error?: string }>;
}

interface CampaignRow {
  id: string;
  title: string;
  body: string | null;
  site_code: string;
  status: string;
}

/**
 * BE-10: Batch AI Analysis Job Processor
 *
 * Processes multiple campaigns by chunking the input into AI sub-batches of
 * `AI_BATCH_SIZE` (default 5) and issuing one DeepSeek call per chunk.
 *
 * Resilience contract:
 * - A failure on one chunk MUST NOT fail the whole job. Successful chunks
 *   still persist; the failed chunk's campaign IDs are reported back so the
 *   scheduler-level dead letter queue (BE-9) can surface them.
 * - Confidence normalization (commit `batch-3b`) lives inside
 *   `queries.insertAiAnalysis` (`toDbConfidence`), so it applies whether we
 *   call the AI once or N times.
 * - When `AI_BATCH_SIZE === 1`, behavior is bit-for-bit equivalent to the
 *   original "tek tek" path: one campaign per AI call, one DB insert per
 *   campaign. The wrapper is a strict superset.
 */
const DEFAULT_AI_BATCH_SIZE = 5;

function getAiBatchSize(): number {
  const raw = process.env.AI_BATCH_SIZE;
  if (!raw) return DEFAULT_AI_BATCH_SIZE;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_AI_BATCH_SIZE;
  return parsed;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 1) return items.map((item) => [item]);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function processAiAnalysisBatchJob(
  payload: Record<string, unknown>
): Promise<AiAnalysisBatchResult> {
  const campaignIds = (payload.campaignIds as string[]) || [];
  const priority = (payload.priority as string) || 'medium';
  const aiBatchSize = getAiBatchSize();

  logger.info(`Processing batch AI analysis for ${campaignIds.length} campaigns`, {
    priority,
    aiBatchSize,
  });

  // Fetch all campaigns from DB
  const campaigns = await fetchCampaignsForBatch(campaignIds);

  if (campaigns.length === 0) {
    logger.warn('No campaigns found for batch processing');
    return { processed: 0, successful: 0, failed: 0, results: [] };
  }

  // Split into AI sub-batches. Each sub-batch fails or succeeds in isolation
  // so a single bad chunk cannot kill the whole job's progress.
  const subBatches = chunk(campaigns, aiBatchSize);
  const allResults: Array<{ campaignId: string; success: boolean; error?: string }> = [];

  logger.info(`Splitting batch into ${subBatches.length} sub-batches of <=${aiBatchSize}`);

  for (let i = 0; i < subBatches.length; i++) {
    const subBatch = subBatches[i];
    const subBatchCampaigns: BatchAnalysisCampaign[] = subBatch.map((c) => ({
      campaignId: String(c.id),
      title: String(c.title),
      body: c.body ? String(c.body) : '',
      siteName: String(c.site_code),
    }));

    try {
      const aiResults = await processBatchWithAI(subBatchCampaigns);
      const updateResults = await updateCampaignsWithResults(aiResults, subBatch);
      allResults.push(...updateResults);

      logger.debug(`Sub-batch ${i + 1}/${subBatches.length} done`, {
        size: subBatch.length,
        successful: updateResults.filter((r) => r.success).length,
        failed: updateResults.filter((r) => !r.success).length,
      });
    } catch (error) {
      // Sub-batch level failure: the AI call (or its parsing) blew up.
      // Do NOT abort the whole job — record per-campaign failure and let the
      // remaining sub-batches keep going. Job-level scheduler will retry the
      // job; if it still fails after maxAttempts, BE-9 dead-letter-queues it.
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Sub-batch ${i + 1}/${subBatches.length} failed: ${errorMessage}`, {
        size: subBatch.length,
      });
      for (const c of subBatch) {
        allResults.push({
          campaignId: String(c.id),
          success: false,
          error: errorMessage,
        });
      }
    }
  }

  const successful = allResults.filter((r) => r.success).length;
  const failed = allResults.filter((r) => !r.success).length;

  logger.info(`Batch AI analysis completed`, {
    processed: campaigns.length,
    successful,
    failed,
    subBatches: subBatches.length,
  });

  return {
    processed: campaigns.length,
    successful,
    failed,
    results: allResults,
  };
}

async function fetchCampaignsForBatch(campaignIds: string[]): Promise<CampaignRow[]> {
  const db = getDb();

  // MySQL uses IN (...) instead of PostgreSQL's = ANY($1)
  const placeholders = campaignIds.map((_, i) => `$${i + 1}`).join(', ');
  const result = await db.query(
    `SELECT c.id, c.title, c.body, s.code as site_code, c.status
     FROM campaigns c
     JOIN sites s ON c.site_id = s.id
     WHERE c.id IN (${placeholders})
     AND c.status != 'deleted'
     ORDER BY c.created_at DESC`,
    campaignIds
  );

  return result.rows as unknown as CampaignRow[];
}

async function processBatchWithAI(
  campaigns: BatchAnalysisCampaign[]
): Promise<BatchAnalysisResult[]> {
  const prompt = buildBatchAnalysisPrompt(campaigns);

  const response = await callDeepSeek(prompt.messages, {
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Empty response from DeepSeek');
  }

  // Try to parse as array directly
  let parsed = safeJsonParse<BatchAnalysisResult[]>(content);

  // If not array, try to find array in the response
  if (!parsed || !Array.isArray(parsed)) {
    // Try to extract array from wrapped object
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      parsed = safeJsonParse<BatchAnalysisResult[]>(arrayMatch[0]);
    }
  }

  if (!parsed || !Array.isArray(parsed)) {
    throw new Error(`Failed to parse batch response as array: ${content.substring(0, 200)}`);
  }

  return parsed;
}

async function updateCampaignsWithResults(
  results: BatchAnalysisResult[],
  campaigns: CampaignRow[]
): Promise<Array<{ campaignId: string; success: boolean; error?: string }>> {
  const db = getDb();
  const updateResults: Array<{ campaignId: string; success: boolean; error?: string }> = [];

  // Create a map for quick lookup
  const resultsMap = new Map<string, BatchAnalysisResult>();
  for (const result of results) {
    resultsMap.set(result.campaign_id, result);
  }

  // Process each campaign
  for (const campaign of campaigns) {
    const campaignId = String(campaign.id);
    const result = resultsMap.get(campaignId);

    if (!result) {
      updateResults.push({
        campaignId,
        success: false,
        error: 'No result returned for campaign',
      });
      continue;
    }

    try {
      // Map category to standard codes
      const categoryCode = mapCategoryToCode(result.category);
      const competitiveIntent = normalizeCompetitiveIntent(result.competitive_intent);
      const competitiveIntentConfidence =
        typeof result.competitive_intent_confidence === 'number'
          ? result.competitive_intent_confidence
          : null;

      // Store AI analysis result. Note: sentimentLabel intentionally null —
      // migration 018 deprecates sentiment in favor of competitive_intent.
      await queries.insertAiAnalysis(db, {
        campaignId,
        analysisType: 'batch_analysis',
        sentimentLabel: null,
        sentimentScore: null,
        competitiveIntent,
        competitiveIntentConfidence,
        categoryCode: categoryCode,
        categoryConfidence: result.confidence,
        summaryText: result.summary,
        keyPoints: result.key_points,
        minDeposit: result.min_deposit,
        maxBonus: result.max_bonus,
        turnover: result.turnover,
        freeBetAmount: result.free_bet_amount,
        cashbackPercent: result.cashback_percent,
        bonusAmount: result.bonus_amount,
        bonusPercentage: result.bonus_percentage,
        rawResponse: result as unknown as Record<string, unknown>,
        confidence: result.confidence,
      });

      updateResults.push({
        campaignId,
        success: true,
      });

      // Note: Skipping publishCampaignEvent in batch mode - the full Campaign object is not available
      // The batch processor updates AI analysis records directly, frontend will see updates on refresh
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to update campaign ${campaignId} with AI result: ${errorMessage}`);

      updateResults.push({
        campaignId,
        success: false,
        error: errorMessage,
      });
    }
  }

  return updateResults;
}

function mapCategoryToCode(category: string): string {
  const categoryMap: Record<string, string> = {
    'hoş-geldin-bonusu': 'hosgeldin',
    'ek-kazanç': 'ek-kazanc',
    'yüksek-oran': 'yuksek-oran',
    'freebet': 'freebet',
    'spesifik-bahis': 'spesifik-bahis',
    'sadakat': 'sadakat',
    'turnuva': 'turnuva',
    'spor-bonus': 'spor',
    'casino-bonus': 'casino',
    'slot-bonus': 'slot',
    'diğer': 'genel',
    // English variants
    'hosgeldin': 'hosgeldin',
    'hos-geldin': 'hosgeldin',
    'cashback': 'ek-kazanc',
    'free-bet': 'freebet',
    'sport': 'spor',
    'casino': 'casino',
    'slot': 'slot',
  };

  const normalized = category.toLowerCase().trim();
  return categoryMap[normalized] || 'genel';
}
