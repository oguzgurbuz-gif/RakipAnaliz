export {
  getShdecnClient,
  callDeepSeek,
  createDeepSeekClient,
  DeepSeekError,
  getShdecnClient as default,
  sleep,
  DEFAULT_CONFIG,
} from './client';

export type {
  ShdecnClient,
  ShdecnMessage,
  ShdecnResponse,
  ShdecnChatOptions,
  DeepSeekConfig,
  ShdecnChoice,
} from './client';

export {
  buildDateExtractionPrompt,
  buildContentAnalysisPrompt,
  buildWeeklyReportPrompt,
  DATE_EXTRACTION_SYSTEM_PROMPT,
  DATE_EXTRACTION_USER_PROMPT_TEMPLATE,
  CONTENT_ANALYSIS_SYSTEM_PROMPT,
  CONTENT_ANALYSIS_USER_PROMPT_TEMPLATE,
  WEEKLY_REPORT_SYSTEM_PROMPT,
  WEEKLY_REPORT_USER_PROMPT_TEMPLATE,
  CATEGORY_CODES,
  SENTIMENT_LABELS,
} from './prompts';

export type {
  DateExtractionTemplateData,
  ContentAnalysisTemplateData,
  WeeklyReportTemplateData,
  CategoryCode,
  SentimentLabel,
} from './prompts';

export {
  extractDates,
  formatIsoDate,
  getCurrentIsoDate,
  getReferenceDate,
} from './date-extraction';

export type {
  DateExtractionContext,
  DateExtractionOutput,
  DateExtractionResultWithValidation,
} from './date-extraction';

export {
  analyzeContent,
  buildAnalysisRecord,
} from './content-analysis';

export type {
  ContentAnalysisContext,
  ContentAnalysisOutput,
  ContentAnalysisResultWithValidation,
  StoredAnalysisRecord,
} from './content-analysis';

export {
  findSimilarCampaigns,
  computeSimilarity,
  buildFingerprintForSimilarity,
  buildSimilarityQuery,
  computeAiSimilarityReason,
  tokenize,
  computeCosineSimilarity,
  computeJaccardSimilarity,
} from './similarity';

export type {
  SimilarityCandidate,
  SimilarityResult,
  FindSimilarOptions,
  SimilaritySearchParams,
} from './similarity';

export {
  generateWeeklyReport,
  buildWeeklyReportRecord,
  buildWeeklyDataset,
  formatDateRange,
  getWeekStart,
  getWeekEnd,
  getCurrentWeekRange,
} from './weekly-report';

export type {
  WeeklyReportContext,
  WeeklyReportOutput,
  WeeklyReportResultWithValidation,
  StoredWeeklyReport,
} from './weekly-report';

export {
  isValidDateExtractionResult,
  isValidContentAnalysisResult,
  isValidWeeklyReportResult,
  isValidWeeklyDataset,
  safeJsonParse,
  parseJsonOrThrow,
} from './schema';

export type {
  DateExtractionResult,
  SentimentInfo,
  CategoryInfo,
  ContentAnalysisResult,
  WeeklyReportCounts,
  WeeklyReportCategoryCount,
  WeeklyReportSiteCount,
  WeeklyReportResult,
  WeeklyDataset,
} from './schema';
