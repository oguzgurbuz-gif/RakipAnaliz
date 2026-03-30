import { callDeepSeek, ShdecnResponse } from './client';
import {
  buildDateExtractionPrompt,
  DateExtractionTemplateData,
} from './prompts';
import {
  DateExtractionResult,
  isValidDateExtractionResult,
  safeJsonParse,
} from './schema';

export interface DateExtractionContext {
  campaignId: string;
  title: string;
  body: string;
  rawDateText?: string;
  referenceDate: string;
}

export interface DateExtractionOutput {
  validFrom: string | null;
  validTo: string | null;
  confidence: number;
  reasoningShort: string;
  rawResponse: ShdecnResponse;
  tokensInput?: number;
  tokensOutput?: number;
  durationMs: number;
}

export interface DateExtractionResultWithValidation {
  success: boolean;
  data?: DateExtractionOutput;
  error?: string;
  retryable?: boolean;
}

export async function extractDates(
  context: DateExtractionContext
): Promise<DateExtractionResultWithValidation> {
  const startTime = Date.now();
  
  const templateData: DateExtractionTemplateData = {
    reference_date: context.referenceDate,
    title: context.title,
    body: context.body,
    raw_date_text: context.rawDateText || '',
  };

  const prompt = buildDateExtractionPrompt(templateData);

  try {
    const response = await callDeepSeek(prompt.messages, {
      temperature: 0.1,
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

    const parsed = safeJsonParse<DateExtractionResult>(content);

    if (!parsed) {
      return {
        success: false,
        error: `Failed to parse JSON response: ${content.substring(0, 200)}`,
        retryable: true,
      };
    }

    if (!isValidDateExtractionResult(parsed)) {
      return {
        success: false,
        error: `Invalid schema in response: ${JSON.stringify(parsed)}`,
        retryable: false,
      };
    }

    if (parsed.confidence < 0.3 && (!parsed.valid_from || !parsed.valid_to)) {
      return {
        success: false,
        error: `Low confidence (${parsed.confidence}) and insufficient date data`,
        retryable: false,
      };
    }

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      data: {
        validFrom: parsed.valid_from,
        validTo: parsed.valid_to,
        confidence: parsed.confidence,
        reasoningShort: parsed.reasoning_short,
        rawResponse: response,
        tokensInput: response.usage?.prompt_tokens,
        tokensOutput: response.usage?.completion_tokens,
        durationMs,
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
      error: `Date extraction failed: ${errorMessage}`,
      retryable: isRetryable,
    };
  }
}

export function formatIsoDate(date: Date, timezone: string = '+03:00'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${timezone}`;
}

export function getCurrentIsoDate(): string {
  return formatIsoDate(new Date());
}

export function getReferenceDate(): string {
  return formatIsoDate(new Date());
}
