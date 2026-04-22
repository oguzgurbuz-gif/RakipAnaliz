import { callDeepSeek, ShdecnResponse } from './client';
import {
  buildContentAnalysisPrompt,
  ContentAnalysisTemplateData,
} from './prompts';
import {
  ContentAnalysisResult,
  isValidContentAnalysisResult,
  normalizeCompetitiveIntent,
  safeJsonParse,
} from './schema';
import type { CompetitiveIntent } from './prompts';

export interface ContentAnalysisContext {
  campaignId: string;
  title: string;
  body: string;
  validFrom?: string | null;
  validTo?: string | null;
  siteName: string;
}

export interface ContentAnalysisOutput {
  /** Legacy. New analyses leave this as 'unknown'; prefer competitiveIntent. */
  sentimentLabel: string;
  sentimentScore: number;
  /** Growth-actionable taxonomy (acquisition / retention / brand / clearance / unknown). */
  competitiveIntent: CompetitiveIntent;
  competitiveIntentConfidence: number | null;
  categoryCode: string;
  categoryConfidence: number;
  summary: string;
  keyPoints: string[];
  riskFlags: string[];
  recommendation: string;
  rawResponse: ShdecnResponse;
  tokensInput?: number;
  tokensOutput?: number;
  durationMs: number;
  minDeposit?: number | null;
  maxBonus?: number | null;
  turnover?: string | null;
  freeBetAmount?: number | null;
  cashbackPercent?: number | null;
  bonusAmount?: number | null;
  bonusPercentage?: number | null;
}

export interface ContentAnalysisResultWithValidation {
  success: boolean;
  data?: ContentAnalysisOutput;
  error?: string;
  retryable?: boolean;
}

export async function analyzeContent(
  context: ContentAnalysisContext
): Promise<ContentAnalysisResultWithValidation> {
  const startTime = Date.now();

  const templateData: ContentAnalysisTemplateData = {
    title: context.title,
    body: context.body,
    valid_from: context.validFrom ?? null,
    valid_to: context.validTo ?? null,
    site_name: context.siteName,
  };

  const prompt = buildContentAnalysisPrompt(templateData);

  try {
    const response = await callDeepSeek(prompt.messages, {
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      return {
        success: false,
        error: 'Empty response from DeepSeek',
        retryable: true,
      };
    }

    const parsed = safeJsonParse<ContentAnalysisResult>(content);

    if (!parsed) {
      return {
        success: false,
        error: `Failed to parse JSON response: ${content.substring(0, 200)}`,
        retryable: true,
      };
    }

    if (!isValidContentAnalysisResult(parsed)) {
      return {
        success: false,
        error: `Invalid schema in response: ${JSON.stringify(parsed)}`,
        retryable: false,
      };
    }

    const durationMs = Date.now() - startTime;

    // Sentiment is no longer requested from the model. Existing legacy
    // responses may still include it; we accept and pass through but the
    // pipeline does not write it to DB anymore.
    const sentimentLabel = typeof parsed.sentiment === 'string' ? parsed.sentiment : 'unknown';
    const sentimentScore = 0.5;
    const competitiveIntent = normalizeCompetitiveIntent(parsed.competitive_intent);
    const competitiveIntentConfidence =
      typeof parsed.competitive_intent_confidence === 'number'
        ? parsed.competitive_intent_confidence
        : null;
    const categoryCode = typeof parsed.category === 'string' ? parsed.category : 'diğer';
    const categoryConfidence = 0.5;

    return {
      success: true,
      data: {
        sentimentLabel,
        sentimentScore,
        competitiveIntent,
        competitiveIntentConfidence,
        categoryCode,
        categoryConfidence,
        summary: parsed.summary,
        keyPoints: parsed.key_points,
        riskFlags: [],
        recommendation: '',
        rawResponse: response,
        tokensInput: response.usage?.prompt_tokens,
        tokensOutput: response.usage?.completion_tokens,
        durationMs,
        minDeposit: parsed.min_deposit ?? null,
        maxBonus: parsed.max_bonus ?? null,
        turnover: parsed.turnover ?? null,
        freeBetAmount: parsed.free_bet_amount ?? null,
        cashbackPercent: parsed.cashback_percent ?? null,
        bonusAmount: parsed.bonus_amount ?? null,
        bonusPercentage: parsed.bonus_percentage ?? null,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    const isRetryable = errorMessage.includes('rate limit') ||
                        errorMessage.includes('timeout') ||
                        errorMessage.includes('network');

    return {
      success: false,
      error: `Content analysis failed: ${errorMessage}`,
      retryable: isRetryable,
    };
  }
}

export interface StoredAnalysisRecord {
  campaignId: string;
  campaignVersionId?: string;
  analysisType: string;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  sentimentLabel: string;
  sentimentScore: number;
  categoryCode: string;
  categoryConfidence: number;
  summaryText: string;
  keyPoints: string[];
  riskFlags: string[];
  recommendationText: string;
  extractedValidFrom?: string | null;
  extractedValidTo?: string | null;
  extractedDateConfidence?: number | null;
  tokensInput?: number;
  tokensOutput?: number;
  durationMs?: number;
  rawRequest?: unknown;
  rawResponse?: unknown;
}

export function buildAnalysisRecord(
  context: ContentAnalysisContext,
  output: ContentAnalysisOutput,
  extra: {
    campaignVersionId?: string;
    promptVersion?: string;
    extractedValidFrom?: string | null;
    extractedValidTo?: string | null;
    extractedDateConfidence?: number | null;
  } = {}
): StoredAnalysisRecord {
  return {
    campaignId: context.campaignId,
    campaignVersionId: extra.campaignVersionId,
    analysisType: 'content_analysis',
    modelProvider: 'deepseek',
    modelName: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    promptVersion: extra.promptVersion || 'campaign-analysis-v2',
    sentimentLabel: output.sentimentLabel,
    sentimentScore: output.sentimentScore,
    categoryCode: output.categoryCode,
    categoryConfidence: output.categoryConfidence,
    summaryText: output.summary,
    keyPoints: output.keyPoints,
    riskFlags: output.riskFlags,
    recommendationText: output.recommendation,
    extractedValidFrom: extra.extractedValidFrom,
    extractedValidTo: extra.extractedValidTo,
    extractedDateConfidence: extra.extractedDateConfidence,
    tokensInput: output.tokensInput,
    tokensOutput: output.tokensOutput,
    durationMs: output.durationMs,
    rawResponse: output.rawResponse,
  };
}
