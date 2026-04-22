export interface SiteConfig {
  code: string;
  name: string;
  baseUrl: string;
  adapter: string;
  enabled: boolean;
  scheduleCron?: string;
  selectors?: Record<string, string>;
  authConfig?: {
    requiresAuth: boolean;
    loginUrl?: string;
    usernameSelector?: string;
    passwordSelector?: string;
  };
}

export interface SiteRecord {
  id: string;
  code: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  lastScrapedAt: Date | null;
  lastScrapeStatus: 'success' | 'failed' | 'never' | null;
  lastScrapeError: string | null;
  campaignCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RawCampaignCard {
  siteCode: string;
  rawId: string;
  title: string;
  description: string | null;
  bonusAmount: string | null;
  bonusPercentage: number | null;
  minDeposit: string | null;
  maxBonus: string | null;
  code: string | null;
  url: string;
  imageUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  termsUrl: string | null;
  category: string | null;
  badge: string | null;
  isFeatured: boolean;
  isExclusive: boolean;
  rawData: Record<string, unknown>;
  scrapedAt: Date;
}

export interface NormalizedCampaignInput {
  siteCode: string;
  fingerprint: string;
  title: string;
  description: string | null;
  bonusType: 'amount' | 'percentage' | 'freebet' | 'cashback' | 'mixed';
  bonusAmount: number | null;
  bonusPercentage: number | null;
  minDeposit: number | null;
  maxBonus: number | null;
  code: string | null;
  url: string;
  imageUrl: string | null;
  startDate: Date | null;
  endDate: Date | null;
  termsUrl: string | null;
  category: string;
  isFeatured: boolean;
  isExclusive: boolean;
  visibility: 'visible' | 'hidden' | 'expired' | 'pending';
  rawFingerprint: string;
}

export interface CampaignVersion {
  id: string;
  campaignId: string;
  versionNumber: number;
  title: string;
  description: string | null;
  bonusType: 'amount' | 'percentage' | 'freebet' | 'cashback' | 'mixed';
  bonusAmount: number | null;
  bonusPercentage: number | null;
  minDeposit: number | null;
  maxBonus: number | null;
  code: string | null;
  url: string;
  imageUrl: string | null;
  startDate: Date | null;
  endDate: Date | null;
  termsUrl: string | null;
  category: string;
  isFeatured: boolean;
  isExclusive: boolean;
  status: 'active' | 'updated' | 'expired' | 'removed';
  changeType: 'created' | 'updated' | 'reactivated' | 'expired' | 'removed';
  diff: CampaignDiff | null;
  createdAt: Date;
}

export interface Campaign {
  id: string;
  siteCode: string;
  fingerprint: string;
  currentVersionId: string;
  title: string;
  status: 'active' | 'updated' | 'expired' | 'pending' | 'hidden';
  visibility: 'visible' | 'hidden' | 'expired' | 'pending';
  firstSeenAt: Date;
  lastSeenAt: Date;
  versionCount: number;
  aiExtractedDates: boolean;
  aiConfidence: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignDiff {
  changedFields: string[];
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}

export interface JobRecord {
  id: number;
  type: JobType;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export type JobType =
  | 'scrape'
  | 'ai-analysis'
  | 'ai-analysis-batch'
  | 'date-extraction'
  | 'weekly-report'
  | 'status-recalc'
  | 'momentum-recalc'
  // Migration 018 — re-process every campaign so competitive_intent is filled.
  | 'competitive-intent-reprocess'
  // Migration 022 — recompute campaign_similarities for the full corpus.
  | 'similarity-recalc';

export interface ScrapeRun {
  id: string;
  siteCode: string;
  status: 'running' | 'success' | 'failed' | 'partial';
  startedAt: Date;
  completedAt: Date | null;
  cardsFound: number;
  newCampaigns: number;
  updatedCampaigns: number;
  unchanged: number;
  errors: ScrapeError[];
}

export interface ScrapeError {
  phase: 'navigation' | 'extraction' | 'normalization' | 'storage';
  message: string;
  url?: string;
  stack?: string;
  timestamp: Date;
}

export type VisibilityStatus = 'visible' | 'hidden' | 'expired' | 'pending';
export type CampaignStatus = 'active' | 'updated' | 'expired' | 'pending' | 'hidden';
export type ScrapeStatus = 'success' | 'failed' | 'partial';

export interface VisibilityTracking {
  previouslyVisible: Set<string>;
  currentlyVisible: Set<string>;
  newlyHidden: Set<string>;
  newlyVisible: Set<string>;
}

export interface AdapterResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  cardsFound?: number;
  duration?: number;
}

export interface PaginationConfig {
  hasNextPage: boolean;
  nextPageSelector?: string;
  pageParam?: string;
  maxPages?: number;
}

export interface SiteAdapter {
  siteCode: string;
  campaignsUrl: string;
  canHandle(url: string): boolean;
  extractCards(page: import('puppeteer').Page): Promise<RawCampaignCard[]>;
  normalize(card: RawCampaignCard): NormalizedCampaignInput;
  expandAll?(page: import('puppeteer').Page): Promise<void>;
  getPaginationConfig?(): PaginationConfig;
}

export { NormalizedCampaignInput as NormalizedInput };
