import { logger } from '../utils/logger';
import { getDb, applyAiExtractedDates, recalculateCampaignStatus } from '../db';
import { extractDatesFromText, needsAiExtraction } from '../date-extraction/parser';
import { triggerAiDateExtraction, AiExtractionRequest } from '../date-extraction/ai-fallback';
import { parseDateText } from '../normalizers/date';
import * as queries from '../db/queries';
import { Campaign } from '../types';

export interface DateExtractionPayload {
  campaignId: string;
  title: string;
  description: string | null;
  termsUrl: string | null;
  termsText: string | null;
  rawData?: Record<string, unknown>;
}

export interface DateExtractionResult {
  campaignId: string;
  startDate: string | null;
  endDate: string | null;
  confidence: number;
  method: 'rule-based' | 'ai-fallback';
  needsAiFallback: boolean;
  processedAt: string;
}

export async function processDateExtractionJob(
  payload: Record<string, unknown>
): Promise<DateExtractionResult> {
  const { campaignId, title, description, termsUrl, termsText } = payload as unknown as DateExtractionPayload;

  logger.info(`Processing date extraction for campaign ${campaignId}`);

  const combinedText = [
    title,
    description ?? '',
    termsText ?? '',
  ].join(' | ');

  const ruleBasedResult = extractDatesFromText(combinedText);

  if (ruleBasedResult.confidence >= 0.7 && ruleBasedResult.endDate) {
    await applyAiExtractedDates(
      campaignId,
      ruleBasedResult.startDate,
      ruleBasedResult.endDate,
      ruleBasedResult.confidence
    );

    await recalculateCampaignStatus(campaignId);

    logger.info(`Date extraction completed for campaign ${campaignId} using rule-based`, {
      startDate: ruleBasedResult.startDate?.toISOString(),
      endDate: ruleBasedResult.endDate?.toISOString(),
      confidence: ruleBasedResult.confidence,
    });

    return {
      campaignId,
      startDate: ruleBasedResult.startDate?.toISOString() ?? null,
      endDate: ruleBasedResult.endDate?.toISOString() ?? null,
      confidence: ruleBasedResult.confidence,
      method: 'rule-based',
      needsAiFallback: false,
      processedAt: new Date().toISOString(),
    };
  }

  logger.info(`Rule-based extraction insufficient for campaign ${campaignId}, triggering AI fallback`, {
    confidence: ruleBasedResult.confidence,
    hasEndDate: ruleBasedResult.endDate !== null,
  });

  const aiRequest: AiExtractionRequest = {
    campaignId,
    title,
    description,
    termsUrl,
    termsText,
    rawData: (payload.rawData as Record<string, unknown>) ?? {},
  };

  const aiResult = await triggerAiDateExtraction(aiRequest);

  await applyAiExtractedDates(
    campaignId,
    aiResult.startDate,
    aiResult.endDate,
    aiResult.confidence
  );

  await recalculateCampaignStatus(campaignId);

  logger.info(`Date extraction completed for campaign ${campaignId} using AI fallback`, {
    startDate: aiResult.startDate?.toISOString(),
    endDate: aiResult.endDate?.toISOString(),
    confidence: aiResult.confidence,
  });

  return {
    campaignId,
    startDate: aiResult.startDate?.toISOString() ?? null,
    endDate: aiResult.endDate?.toISOString() ?? null,
    confidence: aiResult.confidence,
    method: 'ai-fallback',
    needsAiFallback: true,
    processedAt: new Date().toISOString(),
  };
}

export async function batchExtractDates(
  campaignIds: string[]
): Promise<Map<string, DateExtractionResult>> {
  const results = new Map<string, DateExtractionResult>();

  if (!Array.isArray(campaignIds)) {
    logger.warn('campaignIds is not an array, skipping batch date extraction', { campaignIds: typeof campaignIds, value: String(campaignIds).slice(0, 100) });
    return results;
  }

  if (campaignIds.length === 0) {
    logger.info('No campaign IDs provided for batch date extraction');
    return results;
  }

  logger.info(`Starting batch date extraction for ${campaignIds.length} campaigns`);

  for (const campaignId of campaignIds) {
    try {
      const campaign = await getCampaignForDateExtraction(campaignId);

      if (!campaign) {
        logger.warn(`Campaign ${campaignId} not found for date extraction`);
        continue;
      }

      const result = await processDateExtractionJob({
        campaignId,
        title: campaign.title,
        description: campaign.description,
        termsUrl: campaign.termsUrl,
        termsText: null,
      });

      results.set(campaignId, result);
    } catch (error) {
      logger.error(`Failed to extract dates for campaign ${campaignId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      results.set(campaignId, {
        campaignId,
        startDate: null,
        endDate: null,
        confidence: 0,
        method: 'rule-based',
        needsAiFallback: false,
        processedAt: new Date().toISOString(),
      });
    }
  }

  logger.info(`Batch date extraction completed for ${results.size} campaigns`);

  return results;
}

async function getCampaignForDateExtraction(campaignId: string): Promise<{
  title: string;
  description: string | null;
  termsUrl: string | null;
} | null> {
  const db = getDb();
  const row = await queries.getCampaignForDateExtraction(db, campaignId);

  if (!row) {
    return null;
  }

  return {
    title: row.title as string,
    description: row.description as string | null,
    termsUrl: row.terms_url as string | null,
  };
}

export async function reextractDatesForStaleCampaigns(
  maxAgeDays: number = 7
): Promise<number> {
  const db = getDb();
  const staleCampaignIds = await queries.getStaleCampaignsWithoutDates(db, maxAgeDays);

  if (!staleCampaignIds || !Array.isArray(staleCampaignIds) || staleCampaignIds.length === 0) {
    logger.info('No stale campaigns found for date re-extraction');
    return 0;
  }

  logger.info(`Found ${staleCampaignIds.length} stale campaigns for date re-extraction`);

  const results = await batchExtractDates(staleCampaignIds);

  return results.size;
}
