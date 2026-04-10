export interface Site {
  id: string
  name: string
  code: string
  domain?: string
  createdAt?: string
}

export interface Campaign {
  id: string
  siteId: string
  site?: Site
  title: string
  body: string | null
  status: 'active' | 'ended' | 'passive' | 'changed'
  validFrom: string | null
  validTo: string | null
  validFromSource?: string | null
  validToSource?: string | null
  validFromConfidence?: number | null
  validToConfidence?: number | null
  firstSeen: string
  lastSeen: string
  primaryImage: string | null
  fingerprint: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  category?: string | null
  sentiment?: 'positive' | 'negative' | 'neutral' | null
  aiSummary?: string | null
  aiCategory?: string | null
  aiSentiment?: string | null
  aiKeyPoints?: string[] | null
  aiRiskFlags?: string[] | null
  source?: string | null
  latestAI?: AIAnalysis | null
  statusHistory?: CampaignStatusHistory[]
  versions?: CampaignVersion[]
  notes?: CampaignNote[]
  similarCampaigns?: SimilarCampaign[]
}

export interface CampaignNote {
  id: string
  authorName: string | null
  noteText: string
  noteType: string | null
  isPinned: boolean | null
  createdAt: string
  updatedAt: string
}

export interface AIAnalysis {
  id: string
  sentiment: string | null
  sentimentScore: number | null
  category: string | null
  categoryConfidence: number | null
  summary: string | null
  keyPoints: string[] | null
  riskFlags: string[] | null
  recommendation: string | null
  modelProvider: string | null
  modelName: string | null
  analyzedAt: string | null
}

export interface CampaignStatusHistory {
  id: string
  previousStatus: string | null
  newStatus: string
  changedAt: string
  reason: string | null
  context?: string | null
}

export interface CampaignVersion {
  id: string
  campaignId: string
  version: number
  data: Record<string, unknown>
  createdAt: string
}

export interface SimilarCampaign {
  id: string
  title: string
  status: string
  validFrom: string | null
  validTo: string | null
  primaryImage: string | null
  site: {
    name: string
    code: string
  }
  similarityScore: number
  similarityReason: string | null
}

export interface ScrapeRun {
  id: string
  runType: string
  triggerSource: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  siteId: string
  site?: Site
  startedAt: string
  completedAt: string | null
  totalSites: number
  completedSites: number
  failedSites: number
  insertedCount: number
  updatedCount: number
  skippedCount: number
  metadata: Record<string, unknown>
  error: string | null
}

export interface WeeklyReport {
  id: string
  weekStart: string
  weekEnd: string
  weekNumber: number
  year: number
  title: string
  executiveSummary: string | null
  status: string
  siteCoverageCount: number
  campaignCount: number
  startedCount: number
  endedCount: number
  activeOverlapCount: number
  changedCount: number
  passiveCount: number
  createdAt: string
  updatedAt: string
}

export interface WeeklyReportDetail extends WeeklyReport {
  executiveSummary: string | null
  startedCount: number
  endedCount: number
  activeOverlapCount: number
  changedCount: number
  passiveCount: number
  topCategories: { category: string; count: number }[]
  topSites: { siteName: string; count: number }[]
  risks: string[]
  recommendations: string[]
}

export interface ReportSummary {
  dateFrom: string
  dateTo: string
  startedCount: number
  endedCount: number
  activeCount: number
  passiveCount: number
  changedCount: number
  topCategories: { category: string; label?: string; count: number; share?: number }[]
  topSites: { siteName: string; count: number }[]
}

export interface PaginationParams {
  page?: number
  limit?: number
}

export interface CampaignFilters {
  site?: string
  status?: string
  category?: string
  sentiment?: string
  dateMode?: string
  dateCompleteness?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  campaign_type?: string
  sort?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ApiError {
  message: string
  code?: string
}

export type LiveEventType = 
  | 'new_campaign'
  | 'campaign_updated'
  | 'status_changed'
  | 'campaign_created'
  | 'campaign_updated'
  | 'scrape_started'
  | 'scrape_completed'
  | 'scrape_failed'

export interface LiveEvent {
  type: LiveEventType
  data: Record<string, unknown>
  timestamp: string
}
