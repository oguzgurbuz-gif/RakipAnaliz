import { logger } from '../utils/logger';
import { getDb } from '../db';
import { BatchAnalysisCampaign, buildBatchAnalysisPrompt } from '../ai/prompts';
import { callDeepSeek } from '../ai/client';
import { safeJsonParse } from '../ai/schema';
import * as queries from '../db/queries';

export interface AiAnalysisBatchPayload {
  campaignIds: string[];
  priority?: 'low' | 'medium' | 'high';
}

export interface BatchAnalysisResult {
  campaign_id: string;
  category: string;
  sentiment: 'positive' | 'neutral' | 'negative';
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
 * Processes multiple campaigns in a single API call to reduce costs.
 * 50 campaigns = 1 API call instead of 50 API calls.
 */
export async function processAiAnalysisBatchJob(
  payload: Record<string, unknown>
): Promise<AiAnalysisBatchResult> {
  const campaignIds = (payload.campaignIds as string[]) || [];
  const priority = (payload.priority as string) || 'medium';

  logger.info(`Processing batch AI analysis for ${campaignIds.length} campaigns`, { priority });

  // Fetch all campaigns from DB
  const campaigns = await fetchCampaignsForBatch(campaignIds);

  if (campaigns.length === 0) {
    logger.warn('No campaigns found for batch processing');
    return { processed: 0, successful: 0, failed: 0, results: [] };
  }

  // Build batch prompt with all campaigns
  const batchCampaigns: BatchAnalysisCampaign[] = campaigns.map((c) => ({
    campaignId: String(c.id),
    title: String(c.title),
    body: c.body ? String(c.body) : '',
    siteName: String(c.site_code),
  }));

  try {
    // Call AI once for all campaigns
    const result = await processBatchWithAI(batchCampaigns);

    // Update each campaign with results
    const updateResults = await updateCampaignsWithResults(result, campaigns);

    logger.info(`Batch AI analysis completed`, {
      processed: campaigns.length,
      successful: updateResults.filter((r) => r.success).length,
      failed: updateResults.filter((r) => !r.success).length,
    });

    return {
      processed: campaigns.length,
      successful: updateResults.filter((r) => r.success).length,
      failed: updateResults.filter((r) => !r.success).length,
      results: updateResults,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Batch AI analysis failed: ${errorMessage}`);

    // Mark all as failed
    return {
      processed: campaigns.length,
      successful: 0,
      failed: campaigns.length,
      results: campaigns.map((c) => ({
        campaignId: String(c.id),
        success: false,
        error: errorMessage,
      })),
    };
  }
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

      // Store AI analysis result
      await queries.insertAiAnalysis(db, {
        campaignId,
        analysisType: 'batch_analysis',
        sentimentLabel: result.sentiment,
        sentimentScore: result.sentiment === 'positive' ? 1 : result.sentiment === 'negative' ? -1 : 0,
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
