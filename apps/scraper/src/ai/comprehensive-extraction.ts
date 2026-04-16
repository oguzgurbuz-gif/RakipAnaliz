import { logger } from '../utils/logger';
import shdecnClient, { ShdecnClient } from './client';

type DeepSeekModel = string;
import { 
  ComprehensiveExtractionResult, 
  isValidComprehensiveExtractionResult,
  safeJsonParse 
} from './schema';
import { normalizeConfidence01, toDecimal4 } from './confidence';
import { buildComprehensiveExtractionPrompt } from './prompts';

export interface ComprehensiveExtractionOptions {
  title: string;
  body: string;
  rawDateText?: string | null;
  model?: DeepSeekModel;
  timeout?: number;
}

export interface ComprehensiveExtractionResponse {
  success: boolean;
  data?: ComprehensiveExtractionResult;
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  duration_ms?: number;
}

function coerceStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function coerceStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function coerceNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeConfidence(value: unknown): number {
  return toDecimal4(normalizeConfidence01(value) ?? 0);
}

function coerceComprehensiveExtractionResult(obj: unknown): ComprehensiveExtractionResult | null {
  if (!obj || typeof obj !== 'object') return null;
  const r = obj as Record<string, unknown>;

  const conditionsRaw = r.conditions && typeof r.conditions === 'object' ? (r.conditions as Record<string, unknown>) : {};

  const conditions = {
    min_deposit: coerceNumberOrNull(conditionsRaw.min_deposit),
    min_bet: coerceNumberOrNull(conditionsRaw.min_bet),
    max_bet: coerceNumberOrNull(conditionsRaw.max_bet),
    max_bonus: coerceNumberOrNull(conditionsRaw.max_bonus),
    bonus_percentage: coerceNumberOrNull(conditionsRaw.bonus_percentage),
    freebet_amount: coerceNumberOrNull(conditionsRaw.freebet_amount),
    cashback_percentage: coerceNumberOrNull(conditionsRaw.cashback_percentage),
    turnover: coerceStringOrNull(conditionsRaw.turnover),
    promo_code: coerceStringOrNull(conditionsRaw.promo_code),
    eligible_products: coerceStringArray(conditionsRaw.eligible_products),
    deposit_methods: coerceStringArray(conditionsRaw.deposit_methods),
    target_segment: coerceStringArray(conditionsRaw.target_segment),
    max_uses_per_user: coerceStringOrNull(conditionsRaw.max_uses_per_user),
    required_actions: coerceStringArray(conditionsRaw.required_actions),
    excluded_games: coerceStringArray(conditionsRaw.excluded_games),
    time_restrictions: coerceStringOrNull(conditionsRaw.time_restrictions),
    membership_requirements: coerceStringArray(conditionsRaw.membership_requirements),
  };

  const sentimentRaw = r.sentiment;
  const sentiment =
    sentimentRaw === 'positive' || sentimentRaw === 'neutral' || sentimentRaw === 'negative'
      ? sentimentRaw
      : 'neutral';

  // We treat campaign_type / summary as required fields and coerce to safe defaults if missing.
  const summary = typeof r.summary === 'string' ? r.summary : '';

  const coerced: ComprehensiveExtractionResult = {
    valid_from: coerceStringOrNull(r.valid_from),
    valid_to: coerceStringOrNull(r.valid_to),
    date_confidence: normalizeConfidence(r.date_confidence),
    date_reasoning: typeof r.date_reasoning === 'string' ? r.date_reasoning : '',
    campaign_type: typeof r.campaign_type === 'string' ? r.campaign_type : 'genel',
    type_confidence: normalizeConfidence(r.type_confidence),
    type_reasoning: typeof r.type_reasoning === 'string' ? r.type_reasoning : '',
    conditions,
    summary,
    key_points: coerceStringArray(r.key_points),
    sentiment,
    risk_flags: coerceStringArray(r.risk_flags),
    extraction_confidence: normalizeConfidence(r.extraction_confidence),
  };

  return coerced;
}

export async function extractComprehensiveCampaignData(
  options: ComprehensiveExtractionOptions
): Promise<ComprehensiveExtractionResponse> {
  const startTime = Date.now();
  const { title, body, rawDateText, model = 'deepseek-chat', timeout = 30000 } = options;

  if (!body || body.length < 20) {
    return {
      success: false,
      error: 'Campaign body too short for extraction',
    };
  }

  const prompt = buildComprehensiveExtractionPrompt({
    title,
    body,
    rawDateText,
  });

  try {
    const client = shdecnClient();
    const response = await client.chat(prompt.messages, {
      temperature: 0.1,
      max_tokens: 2000,
    });

    const assistantMessage = response.choices[0]?.message?.content;
    if (!assistantMessage) {
      return {
        success: false,
        error: 'No response from AI',
        duration_ms: Date.now() - startTime,
      };
    }

    const jsonMatch = assistantMessage.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('AI response did not contain valid JSON', { 
        response: assistantMessage.substring(0, 200) 
      });
      return {
        success: false,
        error: 'AI response did not contain JSON',
        duration_ms: Date.now() - startTime,
      };
    }

    const parsed = safeJsonParse<ComprehensiveExtractionResult>(jsonMatch[0]);
    
    if (!parsed || !isValidComprehensiveExtractionResult(parsed)) {
      if (parsed) {
        const coerced = coerceComprehensiveExtractionResult(parsed);
        if (coerced) {
          logger.warn('AI response schema mismatch - saving coerced best-effort data', {
            parsed: JSON.stringify(parsed)?.substring(0, 200),
          });
          return {
            success: true,
            data: coerced,
            usage: response.usage
              ? {
                  prompt_tokens: response.usage.prompt_tokens || 0,
                  completion_tokens: response.usage.completion_tokens || 0,
                  total_tokens: response.usage.total_tokens || 0,
                }
              : undefined,
            duration_ms: Date.now() - startTime,
          };
        }
      }

      logger.warn('AI response did not match expected schema', {
        parsed: JSON.stringify(parsed)?.substring(0, 200),
      });

      return {
        success: false,
        error: 'AI response schema mismatch',
        duration_ms: Date.now() - startTime,
      };
    }

    logger.info('Comprehensive extraction completed', {
      campaign_type: parsed.campaign_type,
      date_confidence: parsed.date_confidence,
      extraction_confidence: parsed.extraction_confidence,
    });

    return {
      success: true,
      data: parsed,
      usage: response.usage ? {
        prompt_tokens: response.usage.prompt_tokens || 0,
        completion_tokens: response.usage.completion_tokens || 0,
        total_tokens: response.usage.total_tokens || 0,
      } : undefined,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Comprehensive extraction failed', { error: errorMessage });
    
    return {
      success: false,
      error: errorMessage,
      duration_ms: Date.now() - startTime,
    };
  }
}

export default extractComprehensiveCampaignData;
