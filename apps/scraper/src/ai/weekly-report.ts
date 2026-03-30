import { callDeepSeek, ShdecnResponse } from './client';
import {
  buildWeeklyReportPrompt,
  WeeklyReportTemplateData,
} from './prompts';
import {
  WeeklyReportResult,
  WeeklyDataset,
  isValidWeeklyReportResult,
  isValidWeeklyDataset,
  safeJsonParse,
} from './schema';

export interface WeeklyReportContext {
  weekStart: Date;
  weekEnd: Date;
  dataset: WeeklyDataset;
}

export interface WeeklyReportOutput {
  title: string;
  executiveSummary: string;
  startedCampaignsSummary: string;
  endedCampaignsSummary: string;
  activeDuringRangeSummary: string;
  changedCampaignsSummary: string;
  passiveTransitionsSummary: string;
  topCategories: Array<{ code: string; count: number }>;
  topSites: Array<{ site: string; count: number }>;
  risks: string[];
  recommendations: string[];
  rawResponse: ShdecnResponse;
  tokensInput?: number;
  tokensOutput?: number;
  durationMs: number;
}

export interface WeeklyReportResultWithValidation {
  success: boolean;
  data?: WeeklyReportOutput;
  error?: string;
  retryable?: boolean;
}

export function buildWeeklyDataset(
  context: WeeklyReportContext
): WeeklyDataset {
  return context.dataset;
}

export async function generateWeeklyReport(
  context: WeeklyReportContext
): Promise<WeeklyReportResultWithValidation> {
  const startTime = Date.now();

  const dataset = buildWeeklyDataset(context);

  if (!isValidWeeklyDataset(dataset)) {
    return {
      success: false,
      error: 'Invalid weekly dataset structure',
      retryable: false,
    };
  }

  const templateData: WeeklyReportTemplateData = {
    weekly_dataset_json: JSON.stringify(dataset),
  };

  const prompt = buildWeeklyReportPrompt(templateData);

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

    const parsed = safeJsonParse<WeeklyReportResult>(content);

    if (!parsed) {
      return {
        success: false,
        error: `Failed to parse JSON response: ${content.substring(0, 200)}`,
        retryable: true,
      };
    }

    if (!isValidWeeklyReportResult(parsed)) {
      return {
        success: false,
        error: `Invalid schema in response: ${JSON.stringify(parsed)}`,
        retryable: false,
      };
    }

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      data: {
        title: parsed.title,
        executiveSummary: parsed.executive_summary,
        startedCampaignsSummary: parsed.started_campaigns_summary,
        endedCampaignsSummary: parsed.ended_campaigns_summary,
        activeDuringRangeSummary: parsed.active_during_range_summary,
        changedCampaignsSummary: parsed.changed_campaigns_summary,
        passiveTransitionsSummary: parsed.passive_transitions_summary,
        topCategories: parsed.top_categories,
        topSites: parsed.top_sites,
        risks: parsed.risks,
        recommendations: parsed.recommendations,
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
      error: `Weekly report generation failed: ${errorMessage}`,
      retryable: isRetryable,
    };
  }
}

export interface StoredWeeklyReport {
  reportWeekStart: Date;
  reportWeekEnd: Date;
  title: string;
  executiveSummary: string | null;
  status: string;
  siteCoverageCount: number;
  campaignCount: number;
  startedCount: number;
  endedCount: number;
  activeOverlapCount: number;
  changedCount: number;
  passiveCount: number;
  reportPayload: WeeklyDataset;
}

export function buildWeeklyReportRecord(
  context: WeeklyReportContext,
  output: WeeklyReportOutput
): StoredWeeklyReport {
  return {
    reportWeekStart: context.weekStart,
    reportWeekEnd: context.weekEnd,
    title: output.title,
    executiveSummary: output.executiveSummary,
    status: 'completed',
    siteCoverageCount: new Set(output.topSites.map(s => s.site)).size,
    campaignCount: output.topCategories.reduce((sum, c) => sum + c.count, 0),
    startedCount: context.dataset.counts.started,
    endedCount: context.dataset.counts.ended,
    activeOverlapCount: context.dataset.counts.active_overlap,
    changedCount: context.dataset.counts.changed,
    passiveCount: context.dataset.counts.passive_transitions,
    reportPayload: context.dataset,
  };
}

export function formatDateRange(weekStart: Date, weekEnd: Date): string {
  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function getCurrentWeekRange(): { weekStart: Date; weekEnd: Date } {
  const now = new Date();
  return {
    weekStart: getWeekStart(now),
    weekEnd: getWeekEnd(now),
  };
}
