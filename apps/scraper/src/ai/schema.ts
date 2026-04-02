import { CATEGORY_CODES, SENTIMENT_LABELS } from './prompts';

export interface DateExtractionResult {
  valid_from: string | null;
  valid_to: string | null;
  confidence: number;
  reasoning_short: string;
}

export interface SentimentInfo {
  label: string;
  score: number;
}

export interface CategoryInfo {
  code: string;
  confidence: number;
}

export interface ContentAnalysisResult {
  category: string;
  sentiment: string;
  summary: string;
  key_points: string[];
  min_deposit?: number | null;
  max_bonus?: number | null;
  turnover?: string | null;
  free_bet_amount?: number | null;
  cashback_percent?: number | null;
  bonus_amount?: number | null;
  bonus_percentage?: number | null;
}

export interface WeeklyReportCounts {
  started: number;
  ended: number;
  active_overlap: number;
  changed: number;
  passive_transitions: number;
}

export interface WeeklyReportCategoryCount {
  code: string;
  count: number;
}

export interface WeeklyReportSiteCount {
  site: string;
  count: number;
}

export interface WeeklyReportResult {
  title: string;
  executive_summary: string;
  started_campaigns_summary: string;
  ended_campaigns_summary: string;
  active_during_range_summary: string;
  changed_campaigns_summary: string;
  passive_transitions_summary: string;
  top_categories: WeeklyReportCategoryCount[];
  top_sites: WeeklyReportSiteCount[];
  risks: string[];
  recommendations: string[];
}

export interface WeeklyDataset {
  range: {
    start: string;
    end: string;
  };
  counts: WeeklyReportCounts;
  top_categories: WeeklyReportCategoryCount[];
  top_sites: WeeklyReportSiteCount[];
  samples?: {
    started: unknown[];
    ended: unknown[];
    changed: unknown[];
  };
}

export function isValidDateExtractionResult(obj: unknown): obj is DateExtractionResult {
  if (!obj || typeof obj !== 'object') return false;
  
  const result = obj as Record<string, unknown>;
  
  if (result.valid_from !== null && typeof result.valid_from !== 'string') return false;
  if (result.valid_to !== null && typeof result.valid_to !== 'string') return false;
  if (typeof result.confidence !== 'number') return false;
  if (result.confidence < 0 || result.confidence > 1) return false;
  if (typeof result.reasoning_short !== 'string') return false;
  
  return true;
}

export function isValidSentimentInfo(obj: unknown): obj is SentimentInfo {
  if (!obj || typeof obj !== 'object') return false;
  
  const sentiment = obj as Record<string, unknown>;
  
  if (typeof sentiment.label !== 'string') return false;
  if (!SENTIMENT_LABELS.includes(sentiment.label as typeof SENTIMENT_LABELS[number])) {
    return false;
  }
  if (typeof sentiment.score !== 'number') return false;
  if (sentiment.score < 0 || sentiment.score > 1) return false;
  
  return true;
}

export function isValidSentimentString(obj: unknown): obj is string {
  if (typeof obj !== 'string') return false;
  return SENTIMENT_LABELS.includes(obj as typeof SENTIMENT_LABELS[number]);
}

export function isValidCategoryInfo(obj: unknown): obj is CategoryInfo {
  if (!obj || typeof obj !== 'object') return false;
  
  const category = obj as Record<string, unknown>;
  
  if (typeof category.code !== 'string') return false;
  if (!CATEGORY_CODES.includes(category.code as typeof CATEGORY_CODES[number])) {
    return false;
  }
  if (typeof category.confidence !== 'number') return false;
  if (category.confidence < 0 || category.confidence > 1) return false;
  
  return true;
}

export function isValidCategoryString(obj: unknown): obj is string {
  if (typeof obj !== 'string') return false;
  return CATEGORY_CODES.includes(obj as typeof CATEGORY_CODES[number]);
}

export function isValidContentAnalysisResult(obj: unknown): obj is ContentAnalysisResult {
  if (!obj || typeof obj !== 'object') return false;
  
  const result = obj as Record<string, unknown>;
  
  if (typeof result.category !== 'string') return false;
  if (!CATEGORY_CODES.includes(result.category as typeof CATEGORY_CODES[number])) {
    return false;
  }
  
  if (typeof result.sentiment !== 'string') return false;
  if (!SENTIMENT_LABELS.includes(result.sentiment as typeof SENTIMENT_LABELS[number])) {
    return false;
  }
  
  if (typeof result.summary !== 'string') return false;
  if (!Array.isArray(result.key_points)) return false;
  if (!result.key_points.every((kp: unknown) => typeof kp === 'string')) return false;
  
  const numericFields = ['min_deposit', 'max_bonus', 'free_bet_amount', 'cashback_percent', 'bonus_amount', 'bonus_percentage'];
  for (const field of numericFields) {
    if (field in result && result[field] !== null && typeof result[field] !== 'number') return false;
  }
  
  if ('turnover' in result && result.turnover !== null && typeof result.turnover !== 'string') return false;
  
  return true;
}

export function isValidWeeklyReportResult(obj: unknown): obj is WeeklyReportResult {
  if (!obj || typeof obj !== 'object') return false;
  
  const result = obj as Record<string, unknown>;
  
  if (typeof result.title !== 'string') return false;
  if (typeof result.executive_summary !== 'string') return false;
  if (typeof result.started_campaigns_summary !== 'string') return false;
  if (typeof result.ended_campaigns_summary !== 'string') return false;
  if (typeof result.active_during_range_summary !== 'string') return false;
  if (typeof result.changed_campaigns_summary !== 'string') return false;
  if (typeof result.passive_transitions_summary !== 'string') return false;
  if (!Array.isArray(result.top_categories)) return false;
  if (!Array.isArray(result.top_sites)) return false;
  if (!Array.isArray(result.risks)) return false;
  if (!Array.isArray(result.recommendations)) return false;
  
  return true;
}

export function isValidWeeklyDataset(obj: unknown): obj is WeeklyDataset {
  if (!obj || typeof obj !== 'object') return false;
  
  const dataset = obj as Record<string, unknown>;
  
  if (!dataset.range || typeof dataset.range !== 'object') return false;
  const range = dataset.range as Record<string, unknown>;
  if (typeof range.start !== 'string' || typeof range.end !== 'string') return false;
  
  if (!dataset.counts || typeof dataset.counts !== 'object') return false;
  const counts = dataset.counts as Record<string, unknown>;
  if (typeof counts.started !== 'number') return false;
  if (typeof counts.ended !== 'number') return false;
  if (typeof counts.active_overlap !== 'number') return false;
  if (typeof counts.changed !== 'number') return false;
  if (typeof counts.passive_transitions !== 'number') return false;
  
  return true;
}

export function safeJsonParse<T>(str: string | null | undefined): T | null {
  if (!str) return null;
  
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

export function parseJsonOrThrow<T>(str: string, errorMessage?: string): T {
  const parsed = safeJsonParse<T>(str);
  if (parsed === null) {
    throw new Error(errorMessage || `Failed to parse JSON: ${str.substring(0, 100)}`);
  }
  return parsed;
}

export interface ComprehensiveExtractionResult {
  valid_from: string | null;
  valid_to: string | null;
  date_confidence: number;
  date_reasoning: string;
  campaign_type: string;
  type_confidence: number;
  type_reasoning: string;
  conditions: {
    min_deposit: number | null;
    min_bet: number | null;
    max_bet: number | null;
    max_bonus: number | null;
    bonus_percentage: number | null;
    freebet_amount: number | null;
    cashback_percentage: number | null;
    turnover: string | null;
    promo_code: string | null;
    eligible_products: string[];
    deposit_methods: string[];
    target_segment: string[];
    max_uses_per_user: string | null;
    required_actions: string[];
    excluded_games: string[];
    time_restrictions: string | null;
    membership_requirements: string[];
  };
  summary: string;
  key_points: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  risk_flags: string[];
  extraction_confidence: number;
}

export function isValidComprehensiveExtractionResult(obj: unknown): obj is ComprehensiveExtractionResult {
  if (!obj || typeof obj !== 'object') return false;
  const r = obj as Record<string, unknown>;
  
  if (typeof r.valid_from !== 'string' && r.valid_from !== null) return false;
  if (typeof r.valid_to !== 'string' && r.valid_to !== null) return false;
  if (typeof r.date_confidence !== 'number') return false;
  if (typeof r.date_reasoning !== 'string') return false;
  if (typeof r.campaign_type !== 'string') return false;
  if (typeof r.type_confidence !== 'number') return false;
  if (typeof r.type_reasoning !== 'string') return false;
  if (typeof r.conditions !== 'object' || r.conditions === null) return false;
  if (!Array.isArray(r.key_points)) return false;
  if (!r.key_points.every((value) => typeof value === 'string')) return false;
  if (typeof r.summary !== 'string') return false;
  if (!['positive', 'neutral', 'negative'].includes(r.sentiment as string)) return false;
  if (!Array.isArray(r.risk_flags)) return false;
  if (!r.risk_flags.every((value) => typeof value === 'string')) return false;
  if (typeof r.extraction_confidence !== 'number') return false;

  const conditions = r.conditions as Record<string, unknown>;
  const numericFields = [
    'min_deposit',
    'min_bet',
    'max_bet',
    'max_bonus',
    'bonus_percentage',
    'freebet_amount',
    'cashback_percentage',
  ];
  for (const field of numericFields) {
    if (conditions[field] !== null && typeof conditions[field] !== 'number') return false;
  }

  const stringFields = ['turnover', 'promo_code', 'max_uses_per_user', 'time_restrictions'];
  for (const field of stringFields) {
    if (conditions[field] !== null && typeof conditions[field] !== 'string') return false;
  }

  const arrayFields = [
    'eligible_products',
    'deposit_methods',
    'target_segment',
    'required_actions',
    'excluded_games',
    'membership_requirements',
  ];
  for (const field of arrayFields) {
    if (!Array.isArray(conditions[field])) return false;
    if (!(conditions[field] as unknown[]).every((value) => typeof value === 'string')) return false;
  }
  
  return true;
}
