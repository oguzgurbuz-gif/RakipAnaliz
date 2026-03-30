import { logger } from '../utils/logger';
import shdecnClient, { ShdecnClient } from './client';

type DeepSeekModel = string;
import { 
  ComprehensiveExtractionResult, 
  isValidComprehensiveExtractionResult,
  safeJsonParse 
} from './schema';
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
      logger.warn('AI response did not match expected schema', { 
        parsed: JSON.stringify(parsed)?.substring(0, 200) 
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
