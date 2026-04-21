'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { RefreshCw, Loader2, Play, Bot, ActivitySquare } from 'lucide-react'

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
            </div>

            {actionMessage && <p className="text-sm text-green-600">{actionMessage}</p>}
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          </CardContent>
        </Card>

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
      </main>
    </div>
  )
}