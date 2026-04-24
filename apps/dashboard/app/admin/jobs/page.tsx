'use client'

import { useCallback, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as Tabs from '@radix-ui/react-tabs'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { RefreshCw, Loader2, Play, Bot, ActivitySquare, Target, Network } from 'lucide-react'

type JobRow = {
  id: string
  type: string
  status: string
  priority: number
  attempts: number
  max_attempts: number
  scheduled_at: string
  started_at: string | null
  completed_at: string | null
  error: string | null
  created_at: string
}

type ScrapeRunRow = {
  id: string
  run_type: string
  trigger_source: string
  status: string
  total_sites: number
  completed_sites: number
  failed_sites: number
  inserted_count: number
  updated_count: number
  started_at: string
  completed_at: string | null
  site_name: string | null
  site_code: string | null
}

type AdminJobsData = {
  queueDepth: number
  runningScrapeRuns: number
  completedScrapeRuns: number
  scrapeRuns: ScrapeRunRow[]
  jobs: JobRow[]
}

type SiteOption = {
  id: string
  name: string
  code: string
}

export default function AdminJobsPage() {
  const [campaignIdsInput, setCampaignIdsInput] = useState('')
  const [selectedSiteCodes, setSelectedSiteCodes] = useState<string[]>([])
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Tab state URL'de persist; tarayıcı geri tuşu + paylaşılabilir link
  // (?tab=jobs gibi). Geçersiz değer 'actions' default'una düşer.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const tabParam = searchParams?.get('tab')
  const activeTab: 'actions' | 'scrape-runs' | 'jobs' =
    tabParam === 'scrape-runs' || tabParam === 'jobs' ? tabParam : 'actions'
  const setActiveTab = useCallback(
    (next: 'actions' | 'scrape-runs' | 'jobs') => {
      const params = new URLSearchParams(searchParams?.toString() || '')
      if (next === 'actions') params.delete('tab')
      else params.set('tab', next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    },
    [searchParams, router, pathname]
  )

  const { data, isLoading, refetch } = useQuery<AdminJobsData>({
    queryKey: ['admin-jobs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/jobs')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    refetchInterval: 10000,
  })

  const { data: sitesData } = useQuery<{ success: boolean; data: SiteOption[] }>({
    queryKey: ['admin-sites'],
    queryFn: async () => {
      const res = await fetch('/api/sites')
      if (!res.ok) throw new Error('Failed to fetch sites')
      return res.json()
    },
    staleTime: 60_000,
  })

  // Migration 018 — competitive_intent reprocess status. Polled every 5s
  // while a run is active so the operator can watch progress.
  type ReprocessRun = {
    id: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    totalCampaigns: number
    processedCount: number
    succeededCount: number
    failedCount: number
    distribution: {
      acquisition: number
      retention: number
      brand: number
      clearance: number
      unknown: number
    }
    triggeredBy: string | null
    errorMessage: string | null
    startedAt: string | null
    completedAt: string | null
  }
  type ReprocessStatus = {
    success: boolean
    data: { latestRun: ReprocessRun | null; migrationPending: boolean }
  }
  const { data: reprocessStatus, refetch: refetchReprocess } = useQuery<ReprocessStatus>({
    queryKey: ['competitive-intent-reprocess-status'],
    queryFn: async () => {
      const res = await fetch('/api/admin/reprocess/competitive-intent')
      if (!res.ok) throw new Error('Failed to fetch reprocess status')
      return res.json()
    },
    refetchInterval: (query) => {
      const status = query.state.data?.data?.latestRun?.status
      return status === 'pending' || status === 'running' ? 5000 : 30000
    },
  })
  const latestReprocess = reprocessStatus?.data?.latestRun ?? null

  // Migration 022 — campaign_similarities recalc status. The job itself is
  // single-shot (no progress rows), so we just surface the last row from
  // `jobs` plus a tiny summary (total pairs + average score).
  type SimilarityRun = {
    id: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    result: {
      campaignsConsidered?: number
      pairsEvaluated?: number
      pairsPersisted?: number
      averageScore?: number
      durationMs?: number
    } | null
    error: string | null
    scheduledAt: string | null
    startedAt: string | null
    completedAt: string | null
  }
  type SimilarityStatus = {
    success: boolean
    data: {
      latestRun: SimilarityRun | null
      summary: { totalPairs: number; averageScore: number | null }
    }
  }
  const { data: similarityStatus, refetch: refetchSimilarity } = useQuery<SimilarityStatus>({
    queryKey: ['similarity-recalc-status'],
    queryFn: async () => {
      const res = await fetch('/api/admin/reprocess/similarity')
      if (!res.ok) throw new Error('Failed to fetch similarity status')
      return res.json()
    },
    refetchInterval: (query) => {
      const status = query.state.data?.data?.latestRun?.status
      return status === 'pending' || status === 'processing' ? 5000 : 30000
    },
  })
  const latestSimilarity = similarityStatus?.data?.latestRun ?? null
  const similaritySummary = similarityStatus?.data?.summary ?? null

  const parseCampaignIds = () =>
    campaignIdsInput
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean)

  const selectedSet = new Set(selectedSiteCodes)
  const activeSites = sitesData?.data ?? []

  const toggleSite = (siteCode: string) => {
    setSelectedSiteCodes((prev) =>
      prev.includes(siteCode)
        ? prev.filter((code) => code !== siteCode)
        : [...prev, siteCode]
    )
  }

  const runAction = async (url: string, body: Record<string, unknown>) => {
    setActionError(null)
    setActionMessage(null)
    setIsSubmitting(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.message || json.error || 'İşlem başarısız')
      }
      setActionMessage(json.message || 'İşlem kuyruğa alındı')
      await refetch()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Bilinmeyen hata')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getJobStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'running': return 'bg-blue-100 text-blue-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return '-'
    const endTime = end ? new Date(end).getTime() : Date.now()
    const durationMs = endTime - new Date(start).getTime()
    if (durationMs < 1000) return `${durationMs}ms`
    if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`
    return `${(durationMs / 60000).toFixed(1)}m`
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="İş Yönetimi"
        description="Aktif iş kuyruğunu, scrape çalışmalarını ve sistem sağlığını izleyin."
        actions={
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            Yenile
          </button>
        }
      />

      <main className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Bekleyen İşler</div>
              <div className="text-2xl font-bold">{data?.queueDepth ?? '-'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Aktif Scrape Runs</div>
              <div className="text-2xl font-bold">{data?.runningScrapeRuns ?? '-'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Toplam Tamamlanan</div>
              <div className="text-2xl font-bold">{data?.completedScrapeRuns ?? '-'}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs.Root
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="w-full"
        >
          <Tabs.List className="flex border-b mb-4 flex-wrap">
            <Tabs.Trigger
              value="actions"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              Aksiyonlar
            </Tabs.Trigger>
            <Tabs.Trigger
              value="scrape-runs"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary flex items-center gap-2"
            >
              Scrape Geçmişi
              {data?.scrapeRuns && data.scrapeRuns.length > 0 && (
                <Badge variant="outline" className="h-5 px-1.5">{data.scrapeRuns.length}</Badge>
              )}
            </Tabs.Trigger>
            <Tabs.Trigger
              value="jobs"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary flex items-center gap-2"
            >
              İş Kuyruğu
              {data?.jobs && data.jobs.length > 0 && (
                <Badge variant="outline" className="h-5 px-1.5">{data.jobs.length}</Badge>
              )}
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="actions" className="space-y-4">
        <Card>
          <CardHeader>
            <SectionHeader
              title="Hızlı Admin Aksiyonları"
              description="Scrape tetikleme, AI reindex ve status recalculation işlemlerini buradan çalıştırın."
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <button
                disabled={isSubmitting}
                onClick={() =>
                  runAction('/api/admin/scrape/trigger', {
                    runType: 'manual',
                    priority: 60,
                    ...(selectedSiteCodes.length > 0 ? { siteCodes: selectedSiteCodes } : {}),
                  })
                }
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {selectedSiteCodes.length > 0
                  ? `${selectedSiteCodes.length} Site İçin Scrape Başlat`
                  : 'Tüm Siteler İçin Scrape Başlat'}
              </button>
              <button
                disabled={isSubmitting || selectedSiteCodes.length === 0}
                onClick={() => setSelectedSiteCodes([])}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                Seçimi Temizle
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Scrape için site seçimi (boş bırakılırsa tüm aktif siteler çalışır):
              </p>
              <div className="flex flex-wrap gap-2">
                {activeSites.map((site) => (
                  <button
                    key={site.code}
                    type="button"
                    onClick={() => toggleSite(site.code)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      selectedSet.has(site.code)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    {site.name} ({site.code})
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={campaignIdsInput}
              onChange={(e) => setCampaignIdsInput(e.target.value)}
              rows={3}
              placeholder="Campaign UUID'lerini virgül veya satır ile girin"
              className="w-full rounded-lg border border-border bg-background p-3 text-sm"
            />

            <div className="flex flex-wrap gap-3">
              <button
                disabled={isSubmitting || parseCampaignIds().length === 0}
                onClick={() =>
                  runAction('/api/admin/reindex-ai', {
                    campaignIds: parseCampaignIds(),
                    analysisType: 'full',
                    priority: 65,
                  })
                }
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <Bot className="h-4 w-4" />
                AI Reindex
              </button>

              <button
                disabled={isSubmitting || parseCampaignIds().length === 0}
                onClick={() =>
                  runAction('/api/admin/recalculate-status', {
                    campaignIds: parseCampaignIds(),
                  })
                }
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <ActivitySquare className="h-4 w-4" />
                Status Yeniden Hesapla
              </button>

              {/* Migration 018 — competitive_intent reprocess. Background; the
                  button enqueues a single job that processes all campaigns. */}
              <button
                disabled={
                  isSubmitting ||
                  latestReprocess?.status === 'pending' ||
                  latestReprocess?.status === 'running'
                }
                onClick={async () => {
                  await runAction('/api/admin/reprocess/competitive-intent', {})
                  await refetchReprocess()
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <Target className="h-4 w-4" />
                {latestReprocess?.status === 'running' ||
                latestReprocess?.status === 'pending'
                  ? `Competitive Intent: ${latestReprocess.processedCount}/${latestReprocess.totalCampaigns}`
                  : 'Competitive Intent Re-process'}
              </button>

              {/* Migration 022 — campaign_similarities full recompute. Pure
                  TF-IDF + category + bonus + tag math; no AI calls, so the
                  cost guard is unaffected. Runs to completion in ~1s on the
                  current corpus. */}
              <button
                disabled={
                  isSubmitting ||
                  latestSimilarity?.status === 'pending' ||
                  latestSimilarity?.status === 'processing'
                }
                onClick={async () => {
                  await runAction('/api/admin/reprocess/similarity', {})
                  await refetchSimilarity()
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <Network className="h-4 w-4" />
                {latestSimilarity?.status === 'processing' ||
                latestSimilarity?.status === 'pending'
                  ? 'Similarity hesaplaniyor...'
                  : 'Re-calculate Similarity'}
              </button>
            </div>

            {actionMessage && <p className="text-sm text-green-600">{actionMessage}</p>}
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}

            {/* Latest competitive_intent reprocess summary panel. Renders
                whenever there has ever been a run; hides itself if migration
                table is missing or no run has occurred yet. */}
            {latestReprocess && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">Son competitive_intent run:</span>
                  <Badge className={getJobStatusColor(latestReprocess.status)}>
                    {latestReprocess.status}
                  </Badge>
                  <span className="text-muted-foreground">
                    {latestReprocess.processedCount}/{latestReprocess.totalCampaigns}{' '}
                    işlendi
                  </span>
                  {latestReprocess.completedAt && (
                    <span className="text-xs text-muted-foreground">
                      Bitti: {new Date(latestReprocess.completedAt).toLocaleString('tr-TR')}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800">
                    Yeni Müşteri: {latestReprocess.distribution.acquisition}
                  </span>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                    Mevcut Müşteri: {latestReprocess.distribution.retention}
                  </span>
                  <span className="rounded bg-purple-100 px-2 py-0.5 text-purple-800">
                    Marka: {latestReprocess.distribution.brand}
                  </span>
                  <span className="rounded bg-orange-100 px-2 py-0.5 text-orange-800">
                    Sezon Sonu: {latestReprocess.distribution.clearance}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
                    Belirsiz: {latestReprocess.distribution.unknown}
                  </span>
                  {latestReprocess.failedCount > 0 && (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">
                      Başarısız: {latestReprocess.failedCount}
                    </span>
                  )}
                </div>
                {latestReprocess.errorMessage && (
                  <p className="mt-2 text-xs text-red-600">
                    Hata: {latestReprocess.errorMessage}
                  </p>
                )}
              </div>
            )}

            {/* Migration 022 — similarity-recalc job summary. Always show the
                aggregate counts (so operators can see "47 pairs, avg 0.34"
                even on cold boot); job-level status is layered on top. */}
            {(latestSimilarity || similaritySummary) && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">Son similarity run:</span>
                  {latestSimilarity ? (
                    <Badge className={getJobStatusColor(latestSimilarity.status)}>
                      {latestSimilarity.status}
                    </Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-800">henuz calismadi</Badge>
                  )}
                  {similaritySummary && (
                    <span className="text-muted-foreground">
                      Toplam {similaritySummary.totalPairs} benzerlik cifti
                      {similaritySummary.averageScore !== null && (
                        <> · ort. skor {(similaritySummary.averageScore * 100).toFixed(1)}%</>
                      )}
                    </span>
                  )}
                  {latestSimilarity?.completedAt && (
                    <span className="text-xs text-muted-foreground">
                      Bitti: {new Date(latestSimilarity.completedAt).toLocaleString('tr-TR')}
                    </span>
                  )}
                </div>
                {latestSimilarity?.result && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {typeof latestSimilarity.result.campaignsConsidered === 'number' && (
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800">
                        Kampanya: {latestSimilarity.result.campaignsConsidered}
                      </span>
                    )}
                    {typeof latestSimilarity.result.pairsEvaluated === 'number' && (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                        Ciftler: {latestSimilarity.result.pairsEvaluated}
                      </span>
                    )}
                    {typeof latestSimilarity.result.pairsPersisted === 'number' && (
                      <span className="rounded bg-purple-100 px-2 py-0.5 text-purple-800">
                        Yazildi: {latestSimilarity.result.pairsPersisted}
                      </span>
                    )}
                    {typeof latestSimilarity.result.durationMs === 'number' && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
                        Sure: {latestSimilarity.result.durationMs}ms
                      </span>
                    )}
                  </div>
                )}
                {latestSimilarity?.error && (
                  <p className="mt-2 text-xs text-red-600">Hata: {latestSimilarity.error}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

          </Tabs.Content>

          <Tabs.Content value="scrape-runs" className="space-y-4">
        <Card>
          <CardHeader>
            <SectionHeader
              title="Son Scrape Çalışmaları"
              description="Son 50 scrape run'ın durumu ve istatistikleri."
            />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Tür</TableHead>
                      <TableHead>Kaynak</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead className="text-right">Siteler</TableHead>
                      <TableHead className="text-right">Tamamlanan</TableHead>
                      <TableHead className="text-right">Başarısız</TableHead>
                      <TableHead className="text-right">Eklenen</TableHead>
                      <TableHead className="text-right">Güncellenen</TableHead>
                      <TableHead>Süre</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.scrapeRuns?.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="font-mono text-xs">{run.id.slice(0, 8)}...</TableCell>
                        <TableCell className="text-sm">
                          {run.site_name ? (
                            <span>
                              {run.site_name}
                              {run.site_code && (
                                <span className="ml-1 text-xs text-muted-foreground">({run.site_code})</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{run.run_type}</TableCell>
                        <TableCell>{run.trigger_source}</TableCell>
                        <TableCell>
                          <Badge className={getJobStatusColor(run.status)}>
                            {run.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{run.total_sites}</TableCell>
                        <TableCell className="text-right">{run.completed_sites}</TableCell>
                        <TableCell className="text-right">{run.failed_sites}</TableCell>
                        <TableCell className="text-right">{run.inserted_count}</TableCell>
                        <TableCell className="text-right">{run.updated_count}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDuration(run.started_at, run.completed_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!data?.scrapeRuns || data.scrapeRuns.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          Henüz scrape run yok
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

          </Tabs.Content>

          <Tabs.Content value="jobs" className="space-y-4">
        <Card>
          <CardHeader>
            <SectionHeader
              title="Son İşler (Jobs)"
              description="Son 100 işin durumu. İşler otomatik olarak 10 saniyede yenilenir."
            />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Tür</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead className="text-right">öncelik</TableHead>
                      <TableHead className="text-right">Deneme</TableHead>
                      <TableHead>Planlanan</TableHead>
                      <TableHead>Başlayan</TableHead>
                      <TableHead>Tamamlanan</TableHead>
                      <TableHead>Hata</TableHead>
                      <TableHead className="text-right">Aksiyon</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.jobs?.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-mono text-xs">{String(job.id).slice(0, 8)}...</TableCell>
                        <TableCell className="font-medium">{job.type}</TableCell>
                        <TableCell>
                          <Badge className={getJobStatusColor(job.status)}>
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{job.priority}</TableCell>
                        <TableCell className="text-right">
                          {job.attempts}/{job.max_attempts}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString('tr-TR') : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {job.started_at ? new Date(job.started_at).toLocaleString('tr-TR') : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {job.completed_at ? new Date(job.completed_at).toLocaleString('tr-TR') : '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-red-600">
                          {job.error || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {job.status === 'failed' ? (
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => runAction(`/api/admin/jobs/${job.id}/retry`, {})}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Yeniden Dene
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!data?.jobs || data.jobs.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          Henüz iş yok
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
          </Tabs.Content>
        </Tabs.Root>
      </main>
    </div>
  )
}