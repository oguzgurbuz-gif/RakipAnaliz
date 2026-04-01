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

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  const json = await response.json()

  if (!response.ok) {
    const error = json?.error || json?.message || 'Request failed'
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
  return fetchApi<WeeklyReport[]>('/api/reports/weekly')
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
  const params = new URLSearchParams()
  if (dateFrom) params.append('dateFrom', dateFrom)
  if (dateTo) params.append('dateTo', dateTo)
  
  const queryString = params.toString()
  return fetchApi<ReportSummary>(
    `/api/reports/summary${queryString ? `?${queryString}` : ''}`
  )
}

export async function fetchScrapeRuns(): Promise<ScrapeRun[]> {
  return fetchApi<ScrapeRun[]>('/api/runs')
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
  return fetchApi<TrendData>(`/api/trends?days=${days}`)
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
    valid_to: Date | null
  }[]
  siteMatrix: Record<string, Record<string, {
    category: string
    site_name: string
    site_code: string
    campaign_count: number
    avg_score: number
    is_winner: boolean
  }>>
}

export async function fetchCompetition(category?: string): Promise<CompetitionData> {
  const params = new URLSearchParams()
  if (category) params.append('category', category)
  const queryString = params.toString()
  return fetchApi<CompetitionData>(`/api/competition${queryString ? `?${queryString}` : ''}`)
}
