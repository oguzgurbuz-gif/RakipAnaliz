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

  // BE-5: Try with full prompt first, then shrink if JSON parse fails
  const result = await extractWithRetry({
    title,
    body,
    rawDateText,
    model,
    timeout,
    attempt: 1,
  });

  return {
    ...result,
    duration_ms: Date.now() - startTime,
  };
}

// BE-5: Helper to retry with progressively smaller prompts on JSON parse failure
async function extractWithRetry(options: {
  title: string;
  body: string;
  rawDateText?: string | null;
  model?: string;
  timeout?: number;
  attempt: number;
}): Promise<Omit<ComprehensiveExtractionResponse, 'duration_ms'>> {
  const { title, body, rawDateText, model, timeout, attempt } = options;

  // Build prompt based on attempt number (shrinking each time)
  const prompt = buildPromptVariant({
    title,
    body,
    rawDateText,
    variant: attempt === 1 ? 'full' : attempt === 2 ? 'medium' : 'minimal',
  });

  try {
    const client = shdecnClient();
    const response = await client.chat(prompt.messages, {
      temperature: 0.1,
      max_tokens: attempt === 1 ? 2000 : attempt === 2 ? 1500 : 1000,
    });

    const assistantMessage = response.choices[0]?.message?.content;
    if (!assistantMessage) {
      return {
        success: false,
        error: 'No response from AI',
      };
    }

    const jsonMatch = assistantMessage.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('AI response did not contain valid JSON', {
        attempt,
        response: assistantMessage.substring(0, 200),
      });
      // BE-5: Try again with smaller prompt if this was attempt 1
      if (attempt === 1) {
        return extractWithRetry({ title, body, rawDateText, model, timeout, attempt: 2 });
      }
      if (attempt === 2) {
        return extractWithRetry({ title, body, rawDateText, model, timeout, attempt: 3 });
      }
      return {
        success: false,
        error: 'AI response did not contain JSON',
      };
    }

    const parsed = safeJsonParse<ComprehensiveExtractionResult>(jsonMatch[0]);
    
    if (!parsed || !isValidComprehensiveExtractionResult(parsed)) {
      if (parsed) {
        const coerced = coerceComprehensiveExtractionResult(parsed);
        if (coerced) {
          logger.warn('AI response schema mismatch - saving coerced best-effort data', {
            attempt,
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
          };
        }
      }

      logger.warn('AI response did not match expected schema', {
        attempt,
        parsed: JSON.stringify(parsed)?.substring(0, 200),
      });

      // BE-5: Try again with smaller prompt
      if (attempt === 1) {
        return extractWithRetry({ title, body, rawDateText, model, timeout, attempt: 2 });
      }
      if (attempt === 2) {
        return extractWithRetry({ title, body, rawDateText, model, timeout, attempt: 3 });
      }
      return {
        success: false,
        error: 'AI response schema mismatch',
      };
    }

    logger.info('Comprehensive extraction completed', {
      attempt,
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
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Comprehensive extraction failed', { error: errorMessage, attempt });
    
    // BE-5: Retry with smaller prompt on error
    if (attempt === 1) {
      return extractWithRetry({ title, body, rawDateText, model, timeout, attempt: 2 });
    }
    if (attempt === 2) {
      return extractWithRetry({ title, body, rawDateText, model, timeout, attempt: 3 });
    }
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// BE-5: Build different prompt variants based on attempt
interface PromptVariantOptions {
  title: string;
  body: string;
  rawDateText?: string | null;
  variant: 'full' | 'medium' | 'minimal';
}

function buildPromptVariant(options: PromptVariantOptions) {
  const { title, body, rawDateText, variant } = options;

  if (variant === 'minimal') {
    // Minimal prompt - just the essentials
    const minimalSystem = `Sen Türk bahis platformlarından kampanya verisi çıkaran motorusun. Sadece JSON ver.`;
    const minimalUser = `Başlık: ${title}\nMetin: ${body.substring(0, 500)}\nTarih: ${rawDateText || 'Yok'}\n\nÇıktı (sadece JSON):
{
  "valid_from": null,
  "valid_to": null,
  "date_confidence": 0,
  "date_reasoning": "",
  "campaign_type": "genel",
  "type_confidence": 0,
  "type_reasoning": "",
  "conditions": {
    "min_deposit": null,
    "min_bet": null,
    "max_bet": null,
    "max_bonus": null,
    "bonus_percentage": null,
    "freebet_amount": null,
    "cashback_percentage": null,
    "turnover": null,
    "promo_code": null,
    "eligible_products": [],
    "deposit_methods": [],
    "target_segment": [],
    "max_uses_per_user": null,
    "required_actions": [],
    "excluded_games": [],
    "time_restrictions": null,
    "membership_requirements": []
  },
  "summary": "",
  "key_points": [],
  "sentiment": "neutral",
  "risk_flags": [],
  "extraction_confidence": 0
}`;

    return {
      system: minimalSystem,
      user: minimalUser,
      messages: [
        { role: 'system' as const, content: minimalSystem },
        { role: 'user' as const, content: minimalUser },
      ],
    };
  }

  if (variant === 'medium') {
    // Medium prompt - reduced body
    const mediumSystem = `Sen Türk bahis platformlarından kampanya verisi çıkaran motorusun.
Çıktıyı sadece JSON formatında ver. Yorum yazma. Markdown kullanma.`;
    const mediumUser = `Başlık: ${title}
Metin (kısaltılmış): ${body.substring(0, 1000)}${body.length > 1000 ? '...' : ''}
Tarih ipucu: ${rawDateText || 'Yok'}

Şu formatta JSON ver:
{
  "valid_from": "YYYY-MM-DD" or null,
  "valid_to": "YYYY-MM-DD" or null,
  "date_confidence": 0.0-1.0,
  "date_reasoning": "kısa açıklama",
  "campaign_type": "tip",
  "type_confidence": 0.0-1.0,
  "type_reasoning": "kısa açıklama",
  "conditions": {
    "min_deposit": number or null,
    "bonus_percentage": number or null,
    "freebet_amount": number or null,
    "cashback_percentage": number or null,
    "turnover": "Nx" or null,
    "promo_code": "code or null",
    "eligible_products": [],
    "deposit_methods": [],
    "target_segment": [],
    "max_uses_per_user": null,
    "required_actions": [],
    "excluded_games": [],
    "time_restrictions": null,
    "membership_requirements": [],
    "min_bet": null,
    "max_bet": null,
    "max_bonus": null
  },
  "summary": "2-3 kelime",
  "key_points": [],
  "sentiment": "positive|neutral|negative",
  "risk_flags": [],
  "extraction_confidence": 0.0-1.0
}`;

    return {
      system: mediumSystem,
      user: mediumUser,
      messages: [
        { role: 'system' as const, content: mediumSystem },
        { role: 'user' as const, content: mediumUser },
      ],
    };
  }

  // Full variant - use original prompt
  return buildComprehensiveExtractionPrompt({ title, body, rawDateText });
}

export default extractComprehensiveCampaignData;
