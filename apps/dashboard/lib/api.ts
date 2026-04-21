import type {
  Campaign,
  CampaignFilters,
  CampaignNote,
  CampaignStatusHistory,
  CampaignVersion,
  PaginatedResponse,
  ReportSummary,
  ScrapeRun,
  WeeklyReport,
  WeeklyReportDetail,
} from '@/types'

interface TrendData {
  campaignsOverTime: { date: string; count: number }[]
  categoryByDate: Record<string, Record<string, number>>
  categoryDistribution: { category: string; count: number }[]
  sentimentDistribution: { sentiment: string; count: number }[]
  topSites: { siteName: string; campaignCount: number }[]
  valueScoresBySite: { siteName: string; avgValueScore: number }[]
  topCategoriesThisWeek: { category: string; count: number }[]
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

const EMPTY_REPORT_SUMMARY: ReportSummary = {
  dateFrom: '',
  dateTo: '',
  startedCount: 0,
  endedCount: 0,
  activeCount: 0,
  passiveCount: 0,
  changedCount: 0,
  topCategories: [],
  topSites: [],
}

const EMPTY_TREND_DATA: TrendData = {
  campaignsOverTime: [],
  categoryByDate: {},
  categoryDistribution: [],
  sentimentDistribution: [],
  topSites: [],
  valueScoresBySite: [],
  topCategoriesThisWeek: [],
}

const EMPTY_COMPETITION_DATA: CompetitionData = {
  categories: [],
  sites: [],
  siteRankings: [],
  comparisonTable: [],
  bestDeals: [],
  siteMatrix: {},
  gaps: [],
}

async function withFallback<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    console.warn('API fallback activated:', error)
    return fallback
  }
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    })
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Network request failed')
  }

  const payload = await response.text()
  let json: any = null
  if (payload) {
    try {
      json = JSON.parse(payload)
    } catch {
      json = null
    }
  }

  if (!response.ok) {
    const error = json?.error || json?.message || `Request failed (${response.status})`
    throw new Error(error || `HTTP error ${response.status}`)
  }

  if (json.success === false) {
    throw new Error(json.error?.message || json.error || 'Request failed')
  }

  if (json.success === true && json.data !== undefined) {
    if (json.meta !== undefined) {
      return json as T
    }
    return json.data as T
  }

  if (json.data !== undefined && json.meta !== undefined) {
    return json as T
  }

  return json as T
}

export async function fetchCampaigns(
  filters: CampaignFilters & { page?: number; limit?: number } = {}
): Promise<PaginatedResponse<Campaign>> {
  return withFallback(
    { data: [], total: 0, page: filters.page ?? 1, limit: filters.limit ?? 20, totalPages: 0 },
    async () => {
  const params = new URLSearchParams()
  
  if (filters.site !== undefined && filters.site !== '') {
    params.append('siteId', filters.site)
  }
  if (filters.status !== undefined && filters.status !== '') {
    params.append('status', filters.status)
  }
  if (filters.category !== undefined && filters.category !== '') {
    params.append('category', filters.category)
  }
  if (filters.campaign_type !== undefined && filters.campaign_type !== '') {
    params.append('campaign_type', filters.campaign_type)
  }
  if (filters.sentiment !== undefined && filters.sentiment !== '') {
    params.append('sentiment', filters.sentiment)
  }
  if (filters.dateMode !== undefined) {
    params.append('dateMode', filters.dateMode)
  }
  if (filters.dateCompleteness !== undefined) {
    params.append('dateCompleteness', filters.dateCompleteness)
  }
  if (filters.dateFrom !== undefined && filters.dateFrom !== '') {
    params.append('from', filters.dateFrom)
  }
  if (filters.dateTo !== undefined && filters.dateTo !== '') {
    params.append('to', filters.dateTo)
  }
  if (filters.search !== undefined && filters.search !== '') {
    params.append('search', filters.search)
  }
  
  if (filters.page !== undefined) {
    params.append('page', String(filters.page))
  }
  if (filters.limit !== undefined) {
    params.append('pageSize', String(filters.limit))
  }

  const queryString = params.toString()
  const response = await fetchApi<{ meta: { page: number; pageSize: number; total: number; totalPages: number }; data: any[] }>(
    `/api/campaigns${queryString ? `?${queryString}` : ''}`
  )
  
  const campaigns: Campaign[] = response.data.map((row: any) => ({
    ...row,
    aiKeyPoints: parseJsonField(row.aiKeyPoints),
    aiRiskFlags: parseJsonField(row.aiRiskFlags),
  }))
  
  return {
    data: campaigns,
    total: response.meta.total,
    page: response.meta.page,
    limit: response.meta.pageSize,
    totalPages: response.meta.totalPages,
  }
    }
  )
}

function parseJsonField(value: unknown): string[] | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value as string[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

export async function fetchCampaign(id: string): Promise<Campaign> {
  return fetchApi<Campaign>(`/api/campaigns/${id}`)
}

export async function fetchCampaignSimilar(id: string): Promise<Campaign[]> {
  return fetchApi<Campaign[]>(`/api/campaigns/${id}/similar`)
}

export async function fetchCampaignNotes(id: string): Promise<CampaignNote[]> {
  return fetchApi<CampaignNote[]>(`/api/campaigns/${id}/notes`)
}

export async function fetchCampaignStatusHistory(id: string): Promise<CampaignStatusHistory[]> {
  return fetchApi<CampaignStatusHistory[]>(`/api/campaigns/${id}/status-history`)
}

export async function fetchCampaignVersions(id: string): Promise<CampaignVersion[]> {
  return fetchApi<CampaignVersion[]>(`/api/campaigns/${id}/versions`)
}

export async function addCampaignNote(campaignId: string, content: string): Promise<CampaignNote> {
  return fetchApi<CampaignNote>(`/api/campaigns/${campaignId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export async function updateCampaign(id: string, data: { validFrom?: string | null; validTo?: string | null; body?: string }): Promise<Campaign> {
  return fetchApi<Campaign>(`/api/campaigns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function fetchWeeklyReports(): Promise<WeeklyReport[]> {
  return withFallback([], () => fetchApi<WeeklyReport[]>('/api/reports/weekly'))
}

export async function fetchWeeklyReport(id: string): Promise<WeeklyReportDetail> {
  return fetchApi<WeeklyReportDetail>(`/api/reports/weekly/${id}`)
}

export async function downloadWeeklyReportPdf(id: string): Promise<Blob> {
  const response = await fetch(`/api/reports/${id}/pdf`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Download failed' }))
    throw new Error(error.message || `HTTP error ${response.status}`)
  }
  return response.blob()
}

export async function fetchReportSummary(
  dateFrom?: string,
  dateTo?: string
): Promise<ReportSummary> {
  return withFallback(EMPTY_REPORT_SUMMARY, async () => {
  const params = new URLSearchParams()
  if (dateFrom) params.append('dateFrom', dateFrom)
  if (dateTo) params.append('dateTo', dateTo)
  
  const queryString = params.toString()
  return fetchApi<ReportSummary>(
    `/api/reports/summary${queryString ? `?${queryString}` : ''}`
  )
  })
}

export async function fetchScrapeRuns(): Promise<ScrapeRun[]> {
  return withFallback([], () => fetchApi<ScrapeRun[]>('/api/runs'))
}

export async function fetchScrapeRun(id: string): Promise<ScrapeRun> {
  return fetchApi<ScrapeRun>(`/api/runs/${id}`)
}

export async function triggerScrape(siteId?: string): Promise<{ message: string }> {
  const params = siteId ? `?siteId=${siteId}` : ''
  return fetchApi<{ message: string }>(`/api/admin/scrape/trigger${params}`, {
    method: 'POST',
  })
}

export async function fetchTrends(days: number = 30): Promise<TrendData> {
  return withFallback(EMPTY_TREND_DATA, () => fetchApi<TrendData>(`/api/trends?days=${days}`))
}

export interface CompetitionData {
  categories: string[]
  sites: { site_id: string; site_name: string; site_code: string }[]
  siteRankings: {
    site_id: string
    site_name: string
    site_code: string
    total_campaigns: number
    active_campaigns: number
    avg_bonus: number
    total_bonus: number
    categories_count: number
    active_rate: number
    momentum_score: number
    momentum_direction: 'up' | 'down' | 'stable'
  }[]
  comparisonTable: {
    category: string
    best_site: string
    best_site_campaigns: number
    total_sites: number
    total_campaigns: number
    avg_campaigns_per_site: number
  }[]
  bestDeals: {
    campaign_id: string
    campaign_title: string
    site_name: string
    site_code: string
    category: string
    bonus_amount: number | null
    bonus_percentage: number | null
    status: string
    // Ham DB tarihleri — debug için tutuluyor.
    valid_from: string | Date | null
    valid_to: string | Date | null
    first_seen_at: string | Date | null
    last_seen_at: string | Date | null
    // Türev tarihler — UI bunları primary olarak göstermeli (kampanyanın
    // gerçekten aktif olduğu dönemi yansıtır).
    effective_start: string | Date | null
    effective_end: string | Date | null
    still_active: boolean
  }[]
  siteMatrix: Record<string, Record<string, {
    category: string
    site_name: string
    site_code: string
    campaign_count: number
    avg_score: number
    is_winner: boolean
  }>>
  gaps: GapItem[]
}

export interface GapItem {
  site_id: string
  site_name: string
  site_code: string
  category: string
  site_campaign_count: number
  leader_site_name: string
  leader_site_code: string
  leader_campaign_count: number
  site_avg_bonus: number
  leader_avg_bonus: number
  campaign_delta: number
  bonus_delta: number
  priority: 'high' | 'medium' | 'low'
  score: number
  reason: 'missing' | 'underbonus' | 'both'
}

/**
 * Rekabet ana sayfası verisi.
 *
 * `category` her zaman opsiyonel. `dateRange` opsiyonel — verilirse
 * `?from=&to=` query params'ı eklenir ve API `c.first_seen_at` üzerinden
 * agregasyonları filtreler. Verilmezse mevcut "tüm zamanlar" davranışı korunur.
 */
export async function fetchCompetition(
  category?: string,
  dateRange?: { from?: string; to?: string }
): Promise<CompetitionData> {
  return withFallback(EMPTY_COMPETITION_DATA, async () => {
    const params = new URLSearchParams()
    if (category) params.append('category', category)
    if (dateRange?.from) params.append('from', dateRange.from)
    if (dateRange?.to) params.append('to', dateRange.to)
    const queryString = params.toString()
    return fetchApi<CompetitionData>(`/api/competition${queryString ? `?${queryString}` : ''}`)
  })
}

// ----------------------------------------------------------------------------
// Admin: sites, audit log, cost dashboard, job retry
// ----------------------------------------------------------------------------

export interface AdminSite {
  id: string
  code: string
  name: string
  baseUrl: string
  isActive: boolean
  priority: number
  campaignCount: number
  lastScrapedAt: string | null
  lastScrapeStatus: string | null
  lastScrapeError: string | null
  lastScrapeDuration: number | null
}

export async function fetchAdminSites(): Promise<AdminSite[]> {
  return withFallback<AdminSite[]>([], () =>
    fetchApi<AdminSite[]>('/api/admin/sites')
  )
}

export async function toggleAdminSite(
  siteCode: string,
  isActive: boolean
): Promise<{ siteCode: string; siteId: string; siteName: string; isActive: boolean; changed: boolean }> {
  return fetchApi<{ siteCode: string; siteId: string; siteName: string; isActive: boolean; changed: boolean }>(
    '/api/admin/sites/toggle',
    {
      method: 'POST',
      body: JSON.stringify({ siteCode, isActive }),
    }
  )
}

export async function retryAdminJob(
  jobId: string | number
): Promise<{ jobId: string | number; type: string; status: string; attempts: number; message: string }> {
  return fetchApi(`/api/admin/jobs/${jobId}/retry`, { method: 'POST' })
}

export interface AuditLogEntry {
  id: string
  actor: string
  action: string
  resourceType: string
  resourceId: string | null
  changes: unknown
  ip: string | null
  createdAt: string
}

export interface AuditLogPage {
  data: { items: AuditLogEntry[]; migrationPending: boolean }
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

export async function fetchAdminAuditLogs(params: {
  page?: number
  pageSize?: number
  action?: string
  resourceType?: string
  actor?: string
  from?: string
  to?: string
}): Promise<AuditLogPage> {
  return withFallback<AuditLogPage>(
    {
      data: { items: [], migrationPending: true },
      meta: { page: params.page ?? 1, pageSize: params.pageSize ?? 100, total: 0, totalPages: 0 },
    },
    async () => {
      const search = new URLSearchParams()
      if (params.page) search.set('page', String(params.page))
      if (params.pageSize) search.set('pageSize', String(params.pageSize))
      if (params.action) search.set('action', params.action)
      if (params.resourceType) search.set('resourceType', params.resourceType)
      if (params.actor) search.set('actor', params.actor)
      if (params.from) search.set('from', params.from)
      if (params.to) search.set('to', params.to)
      const qs = search.toString()
      return fetchApi<AuditLogPage>(`/api/admin/audit${qs ? `?${qs}` : ''}`)
    }
  )
}

export interface AiCostDailyPoint {
  day: string
  inTokens: number
  outTokens: number
  calls: number
  usd: number
}

export interface AiCostByModel {
  modelProvider: string
  modelName: string
  inTokens: number
  outTokens: number
  calls: number
  usd: number
  pricePerMillionInput: number
  pricePerMillionOutput: number
}

export interface AiCostTopAnalysis {
  id: string
  campaignId: string
  campaignTitle: string | null
  modelProvider: string
  modelName: string
  inTokens: number
  outTokens: number
  durationMs: number | null
  createdAt: string
  usd: number
}

export interface AiCostDashboardData {
  windowDays: number
  /** Sunucudan dönen normalize edilmiş from sınırı (YYYY-MM-DD HH:mm:ss) — opsiyonel. */
  from?: string | null
  /** Sunucudan dönen normalize edilmiş to sınırı (YYYY-MM-DD HH:mm:ss) — opsiyonel. */
  to?: string | null
  pricing: {
    defaultInputPerMillionUSD: number
    defaultOutputPerMillionUSD: number
    models: Record<string, { input: number; output: number }>
  }
  totals: { inTokens: number; outTokens: number; calls: number; usd: number }
  daily: AiCostDailyPoint[]
  byModel: AiCostByModel[]
  topAnalyses: AiCostTopAnalysis[]
}

const EMPTY_AI_COST: AiCostDashboardData = {
  windowDays: 30,
  pricing: {
    defaultInputPerMillionUSD: 0.14,
    defaultOutputPerMillionUSD: 0.28,
    models: {},
  },
  totals: { inTokens: 0, outTokens: 0, calls: 0, usd: 0 },
  daily: [],
  byModel: [],
  topAnalyses: [],
}

/**
 * Admin AI cost dashboard verisini getirir.
 *
 * Geriye dönük uyumlu: argüman vermezsen son 30 günlük pencere kullanılır
 * (sunucu default'u). `from`/`to` opsiyonel; YYYY-MM-DD veya
 * YYYY-MM-DD HH:mm[:ss] formatında olabilir. Boş string gönderme; yoksa
 * `undefined` bırak.
 */
export async function fetchAdminCost(
  from?: string,
  to?: string
): Promise<AiCostDashboardData> {
  return withFallback<AiCostDashboardData>(EMPTY_AI_COST, () => {
    const search = new URLSearchParams()
    if (from) search.set('from', from)
    if (to) search.set('to', to)
    const qs = search.toString()
    return fetchApi<AiCostDashboardData>(`/api/admin/cost${qs ? `?${qs}` : ''}`)
  })
}

export interface SiteProfileSite {
  site_id: string
  site_name: string
  site_code: string
  base_url: string | null
  last_scraped_at: string | Date | null
  momentum_score: number
  momentum_direction: 'up' | 'down' | 'stable'
  momentum_last_7_days: number
  momentum_prev_7_days: number
  momentum_updated_at: string | Date | null
  total_campaigns: number
  active_campaigns: number
  avg_bonus: number
  total_bonus: number
  categories_count: number
  active_rate: number
}

export interface SiteProfileCategoryRow {
  category: string
  campaign_count: number
  active_count: number
  avg_bonus: number
  total_bonus: number
  rank: number
  total_sites: number
  category_avg_bonus: number
  leader_site_id: string
  leader_site_name: string
  leader_site_code: string
  leader_campaign_count: number
  leader_avg_bonus: number
  is_leader: boolean
}

export interface SiteProfileActiveCampaign {
  id: string
  title: string
  category: string | null
  bonus_amount: number | null
  bonus_percentage: number | null
  status: string
  // Ham DB tarihleri — landing page'deki orijinal "geçerlilik" yazısıdır.
  // Çoğu zaman geçmişe atıfta bulunur (kampanya tekrar yayınlandı), bu yüzden
  // UI artık bunları primary olarak göstermez. Debug/tooltip için tutuluyor.
  valid_from: string | Date | null
  valid_to: string | Date | null
  first_seen_at: string | Date | null
  last_seen_at: string | Date | null
  // Türev tarihler — UI primary olarak bunları göstermeli. Kampanyanın
  // SCRAPE'TE aktif olduğu dönemi yansıtır:
  //   effective_start = ilk görüldüğü an (gelecek tarihli valid_from varsa o)
  //   effective_end   = valid_to gelecekteyse o, değilse en son görüldüğü an
  //   still_active    = son 7 gün içinde scrape'te yakalandı VE valid_to geçmedi
  effective_start: string | Date | null
  effective_end: string | Date | null
  still_active: boolean
}

export interface SiteProfileMomentumPoint {
  week_offset: number
  week_label: string
  new_campaigns: number
  score: number
  direction: 'up' | 'down' | 'stable'
}

export interface SiteProfileData {
  site: SiteProfileSite | null
  categoryHeatmap: SiteProfileCategoryRow[]
  activeCampaigns: SiteProfileActiveCampaign[]
  momentumTimeline: SiteProfileMomentumPoint[]
  fallback?: boolean
}

const EMPTY_SITE_PROFILE: SiteProfileData = {
  site: null,
  categoryHeatmap: [],
  activeCampaigns: [],
  momentumTimeline: [],
}

/**
 * Tek site rekabet profili. `dateRange` verilirse aggregasyonlar
 * (categoryHeatmap, top stats, activeCampaigns) o aralığa scope edilir.
 * `momentumTimeline` ve `momentum_*` alanları her zaman gerçek zamanlıdır.
 */
export async function fetchSiteProfile(
  code: string,
  dateRange?: { from?: string; to?: string }
): Promise<SiteProfileData> {
  return withFallback(EMPTY_SITE_PROFILE, () => {
    const params = new URLSearchParams()
    if (dateRange?.from) params.append('from', dateRange.from)
    if (dateRange?.to) params.append('to', dateRange.to)
    const queryString = params.toString()
    return fetchApi<SiteProfileData>(
      `/api/competition/sites/${encodeURIComponent(code)}${queryString ? `?${queryString}` : ''}`
    )
  })
}

// ---------------------------------------------------------------------------
// Report schedules (persisted via /api/reports/schedule)
// ---------------------------------------------------------------------------

export type ReportScheduleFrequency = 'weekly' | 'monthly'

export interface ReportSchedule {
  id: string
  frequency: ReportScheduleFrequency
  recipients: string[]
  dayOfWeek: number | null
  hour: number
  enabled: boolean
  lastSentAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ReportScheduleInput {
  frequency: ReportScheduleFrequency
  recipients: string[]
  dayOfWeek?: number | null
  hour?: number
  enabled?: boolean
}

export async function fetchReportSchedules(): Promise<ReportSchedule[]> {
  return withFallback([], () => fetchApi<ReportSchedule[]>('/api/reports/schedule'))
}

export async function createReportSchedule(
  input: ReportScheduleInput
): Promise<ReportSchedule> {
  return fetchApi<ReportSchedule>('/api/reports/schedule', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateReportSchedule(
  id: string,
  input: Partial<ReportScheduleInput>
): Promise<ReportSchedule> {
  return fetchApi<ReportSchedule>('/api/reports/schedule', {
    method: 'PUT',
    body: JSON.stringify({ id, ...input }),
  })
}

export async function deleteReportSchedule(id: string): Promise<{ id: string }> {
  return fetchApi<{ id: string }>(
    `/api/reports/schedule?id=${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  )
}

// ---------------------------------------------------------------------------
// Weekly report CSV export + filtering helpers
// ---------------------------------------------------------------------------

export async function fetchWeeklyReportsFiltered(
  filters: { from?: string; to?: string } = {}
): Promise<WeeklyReport[]> {
  return withFallback([], async () => {
    const all = await fetchApi<WeeklyReport[]>('/api/reports/weekly')
    if (!filters.from && !filters.to) return all
    const fromTs = filters.from ? new Date(filters.from).getTime() : -Infinity
    const toTs = filters.to ? new Date(filters.to).getTime() : Infinity
    return all.filter((report) => {
      const start = report.weekStart ? new Date(report.weekStart).getTime() : NaN
      if (Number.isNaN(start)) return true
      return start >= fromTs && start <= toTs
    })
  })
}

export function buildWeeklyReportsCsvUrl(
  filters: { from?: string; to?: string } = {}
): string {
  const params = new URLSearchParams()
  if (filters.from) params.append('from', filters.from)
  if (filters.to) params.append('to', filters.to)
  params.append('format', 'csv')
  return `${API_BASE}/api/reports/export?${params.toString()}`
}

export async function downloadWeeklyReportsCsv(
  filters: { from?: string; to?: string } = {}
): Promise<Blob> {
  const response = await fetch(buildWeeklyReportsCsvUrl(filters))
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `CSV export failed (${response.status})`)
  }
  return response.blob()
}

// --- Calendar overlaps (cross-site collisions on shared start day + category)
export interface CalendarOverlap {
  date: string
  category: string
  sites: string[]
  campaign_count: number
}

export async function fetchCalendarOverlaps(
  from?: string,
  to?: string
): Promise<CalendarOverlap[]> {
  return withFallback([], async () => {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const queryString = params.toString()
    return fetchApi<CalendarOverlap[]>(
      `/api/calendar/overlaps${queryString ? `?${queryString}` : ''}`
    )
  })
}
