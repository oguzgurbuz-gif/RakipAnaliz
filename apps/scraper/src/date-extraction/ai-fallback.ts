import { logger } from '../utils/logger';
import { extractDatesFromText, needsAiExtraction, ExtractionResult } from './parser';
import { extractDates, DateExtractionContext } from '../ai/date-extraction';

export interface AiExtractionTrigger {
  shouldTrigger: boolean;
  reason: string;
  priority: 'low' | 'medium' | 'high';
}

export interface AiExtractionRequest {
  campaignId: string;
  title: string;
  description: string | null;
  termsUrl: string | null;
  termsText: string | null;
  rawData: Record<string, unknown>;
}

export function shouldTriggerAiExtraction(
  title: string,
  description: string | null,
  termsText: string | null,
  currentResult: ExtractionResult
): AiExtractionTrigger {
  const descriptionLength = description?.length ?? 0;
  const isDescriptionShort = descriptionLength < 50;

  if (needsAiExtraction(currentResult)) {
    const priority: 'low' | 'medium' | 'high' = 
      (currentResult.confidence < 0.3 || isDescriptionShort) ? 'high' : 'medium';
    return {
      shouldTrigger: true,
      reason: isDescriptionShort 
        ? 'Rule-based confidence low AND description is short/missing' 
        : 'Rule-based extraction confidence below threshold',
      priority,
    };
  }

  if (!currentResult.endDate && isDescriptionShort) {
    return {
      shouldTrigger: true,
      reason: 'Missing end date AND description is short - triggering AI aggressively',
      priority: 'high',
    };
  }

  const titleLower = title.toLowerCase();
  const hasDeadlineKeywords = titleLower.includes('son') ||
    titleLower.includes('bitiş') ||
    titleLower.includes('kadar') ||
    titleLower.includes('deadline') ||
    titleLower.includes('expires');

  if (hasDeadlineKeywords && !currentResult.endDate) {
    return {
      shouldTrigger: true,
      reason: 'Title contains deadline keywords but no date extracted',
      priority: isDescriptionShort ? 'high' : 'medium',
    };
  }

  if (descriptionLength > 500 && !currentResult.endDate) {
    return {
      shouldTrigger: true,
      reason: 'Long description without date extraction',
      priority: 'low',
    };
  }

  if (termsText && termsText.length > 100 && !currentResult.endDate) {
    return {
      shouldTrigger: true,
      reason: 'Terms text present but no date extracted',
      priority: 'low',
    };
  }

  return {
    shouldTrigger: false,
    reason: 'Sufficient confidence from rule-based extraction',
    priority: 'low',
  };
}

export function shouldUseDescriptionForAiExtraction(description: string | null): boolean {
  return description !== null && description.length > 50;
}

export async function triggerAiDateExtraction(request: AiExtractionRequest): Promise<ExtractionResult> {
  const descriptionLength = request.description?.length ?? 0;
  const useDescriptionForAi = shouldUseDescriptionForAiExtraction(request.description);

  logger.info('Triggering AI date extraction', {
    campaignId: request.campaignId,
    titleLength: request.title?.length ?? 0,
    descriptionLength,
    useDescriptionForAi,
  });

  try {
    let bodyText: string;
    if (useDescriptionForAi) {
      bodyText = request.description!;
      logger.info('Using rich description for AI extraction', {
        campaignId: request.campaignId,
        descriptionLength,
      });
    } else if (request.description && request.description.length > 0) {
      bodyText = `${request.title} | ${request.title} | ${request.description}`;
      logger.info('Description too short, repeating title for context', {
        campaignId: request.campaignId,
        descriptionLength: request.description.length,
      });
    } else {
      bodyText = request.title;
      logger.info('No description available, using title only', {
        campaignId: request.campaignId,
      });
    }

    if (request.termsText && request.termsText.length > 0) {
      bodyText = `${bodyText} | ${request.termsText}`;
    }

    const context: DateExtractionContext = {
      campaignId: request.campaignId,
      title: request.title,
      body: bodyText,
      referenceDate: new Date().toISOString(),
    };

    const aiResult = await extractDates(context);

    if (!aiResult.success || !aiResult.data) {
      logger.error('AI date extraction failed', {
        campaignId: request.campaignId,
        error: aiResult.error ?? 'Unknown error',
      });
      return {
        startDate: null,
        endDate: null,
        confidence: 0,
        matchedRule: 'AI_FAILED',
        rawTexts: { start: null, end: null },
      };
    }

    const startDate = aiResult.data.validFrom ? new Date(aiResult.data.validFrom) : null;
    const endDate = aiResult.data.validTo ? new Date(aiResult.data.validTo) : null;

    logger.info('AI date extraction completed', {
      campaignId: request.campaignId,
      confidence: aiResult.data.confidence,
      hasStartDate: startDate !== null,
      hasEndDate: endDate !== null,
    });

    return {
      startDate,
      endDate,
      confidence: aiResult.data.confidence,
      matchedRule: 'AI_EXTRACTION',
      rawTexts: { start: aiResult.data.validFrom, end: aiResult.data.validTo },
    };
  } catch (error) {
    logger.error('AI date extraction failed', {
      campaignId: request.campaignId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      startDate: null,
      endDate: null,
      confidence: 0,
      matchedRule: 'AI_FAILED',
      rawTexts: { start: null, end: null },
    };
  }
}

export function createAiExtractionJob(request: AiExtractionRequest): Record<string, unknown> {
  return {
    type: 'date-extraction',
    priority: shouldTriggerAiExtraction(
      request.title,
      request.description,
      request.termsText,
      { startDate: null, endDate: null, confidence: 0, matchedRule: null, rawTexts: { start: null, end: null } }
    ).priority,
    payload: request,
    scheduledAt: new Date(),
    maxAttempts: 3,
  };
}

export function isHighPriorityCampaign(title: string, description: string | null): boolean {
  const highPriorityKeywords = [
    'exclusive',
    'özel',
    'bonus',
    'bonüs',
    'freebet',
    'free bet',
    'cashback',
    'hoşgeldin',
    'welcome',
    'first deposit',
    'ilk yatırım',
  ];

  const combined = `${title} ${description ?? ''}`.toLowerCase();

  return highPriorityKeywords.some((keyword) => combined.includes(keyword));
}

export function estimateAiConfidence(result: ExtractionResult): number | null {
  if (result.confidence > 0) {
    return Math.round(result.confidence * 100);
  }
  return null;
}
