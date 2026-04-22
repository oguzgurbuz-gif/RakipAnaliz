'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

/* ---------------------------------------------------------------------------
 * Types & API helpers (kept local — alert admin is a self-contained surface
 * and we don't want to bloat lib/api.ts for a single-screen feature).
 * ------------------------------------------------------------------------- */

interface AlertSettings {
  slackWebhookUrl: string
  bonusChangeThresholdPct: number
  digestTimeHour: number
  enabled: boolean
  updatedAt: string | null
  migrationPending?: boolean
}

interface SmartAlert {
  id: string
  alertType: 'bonus_change' | 'category_change' | 'new_campaign' | 'kvkk_change'
  severity: 'low' | 'medium' | 'high'
  campaignId: string | null
  siteId: string | null
  siteName: string | null
  siteCode: string | null
  title: string | null
  description: string | null
  payload: Record<string, unknown>
  pushedToSlack: boolean
  pushedToSlackAt: string | null
  createdAt: string
}

interface AlertsListResponse {
  alerts: SmartAlert[]
  migrationPending: boolean
}

async function unwrap<T>(res: Response): Promise<T> {
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const message = json?.error?.message ?? json?.error ?? `Request failed (${res.status})`
    throw new Error(typeof message === 'string' ? message : 'Request failed')
  }
  // Routes use successResponse({ data, success: true }).
  return (json?.data ?? json) as T
}

async function fetchSettings(): Promise<AlertSettings> {
  const res = await fetch('/api/admin/alerts/settings')
  return unwrap<AlertSettings>(res)
}

async function saveSettings(input: {
  slack_webhook_url: string | null
  bonus_change_threshold_pct: number
  digest_time_hour: number
  enabled: boolean
}): Promise<AlertSettings> {
  const res = await fetch('/api/admin/alerts/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return unwrap<AlertSettings>(res)
}

async function sendTest(url?: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/admin/alerts/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(url ? { url } : {}),
  })
  return unwrap<{ ok: boolean; message: string }>(res)
}

async function fetchAlerts(filters: {
  type: string
  severity: string
  pushed: string
}): Promise<AlertsListResponse> {
  const search = new URLSearchParams()
  if (filters.type) search.set('type', filters.type)
  if (filters.severity) search.set('severity', filters.severity)
  if (filters.pushed) search.set('pushed', filters.pushed)
  search.set('limit', '50')
  const res = await fetch(`/api/admin/alerts/list?${search.toString()}`)
  return unwrap<AlertsListResponse>(res)
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

const TYPE_LABEL: Record<SmartAlert['alertType'], string> = {
  bonus_change: 'Bonus Değişikliği',
  category_change: 'Kategori Değişikliği',
  new_campaign: 'Yeni Kampanya',
  kvkk_change: 'KVKK Değişikliği',
}

const SEVERITY_BADGE: Record<SmartAlert['severity'], string> = {
  low: 'bg-slate-100 text-slate-700 border-slate-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  high: 'bg-red-100 text-red-800 border-red-200',
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('tr-TR')
  } catch {
    return iso
  }
}

/* ---------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */

export default function AdminAlertsPage() {
  const queryClient = useQueryClient()

  const settingsQuery = useQuery<AlertSettings>({
    queryKey: ['alert-settings'],
    queryFn: fetchSettings,
  })

  const [draftUrl, setDraftUrl] = React.useState('')
  const [draftThreshold, setDraftThreshold] = React.useState<number>(20)
  const [draftDigestHour, setDraftDigestHour] = React.useState<number>(9)
  const [draftEnabled, setDraftEnabled] = React.useState<boolean>(true)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [testFeedback, setTestFeedback] = React.useState<{
    type: 'ok' | 'err'
    message: string
  } | null>(null)

  React.useEffect(() => {
    if (settingsQuery.data) {
      setDraftUrl(settingsQuery.data.slackWebhookUrl)
      setDraftThreshold(settingsQuery.data.bonusChangeThresholdPct)
      setDraftDigestHour(settingsQuery.data.digestTimeHour)
      setDraftEnabled(settingsQuery.data.enabled)
    }
  }, [settingsQuery.data])

  const saveMutation = useMutation({
    mutationFn: () =>
      saveSettings({
        slack_webhook_url: draftUrl.trim() ? draftUrl.trim() : null,
        bonus_change_threshold_pct: draftThreshold,
        digest_time_hour: draftDigestHour,
        enabled: draftEnabled,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['alert-settings'], next)
      setSaveError(null)
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : 'Kaydetme başarısız')
    },
  })

  const testMutation = useMutation({
    mutationFn: () => sendTest(draftUrl.trim() || undefined),
    onSuccess: (res) => {
      setTestFeedback({ type: 'ok', message: res.message })
    },
    onError: (err) => {
      setTestFeedback({
        type: 'err',
        message: err instanceof Error ? err.message : 'Test başarısız',
      })
    },
  })

  // Filters
  const [filterType, setFilterType] = React.useState<string>('')
  const [filterSeverity, setFilterSeverity] = React.useState<string>('')
  const [filterPushed, setFilterPushed] = React.useState<string>('')

  const alertsQuery = useQuery<AlertsListResponse>({
    queryKey: ['smart-alerts', filterType, filterSeverity, filterPushed],
    queryFn: () =>
      fetchAlerts({
        type: filterType,
        severity: filterSeverity,
        pushed: filterPushed,
      }),
    refetchInterval: 30_000,
  })

  const settings = settingsQuery.data
  const trimmedDraftUrl = draftUrl.trim()
  const testDisabled =
    testMutation.isPending ||
    saveMutation.isPending ||
    (!trimmedDraftUrl && !(settings?.slackWebhookUrl ?? '').trim())

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Smart Alerts"
        description="Kampanya bonus / kategori / yeni-kampanya değişikliklerini Slack webhook'una göndericinin yönetimi."
        actions={
          <button
            onClick={() => alertsQuery.refetch()}
            disabled={alertsQuery.isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', alertsQuery.isFetching && 'animate-spin')} />
            Yenile
          </button>
        }
      />

      <main className="space-y-6 p-6">
        {settings?.migrationPending && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800">Migration #017 henüz uygulanmadı</p>
              <p className="text-amber-700/90 mt-0.5">
                <code>alert_settings</code> ve <code>smart_alerts</code> tabloları yok. Scraper&apos;ı
                yeniden başlattığınızda migration otomatik uygulanır.
              </p>
            </div>
          </div>
        )}

        {/* Settings card */}
        <Card>
          <CardHeader>
            <SectionHeader
              title="Slack & Tetikleyici Ayarları"
              description="Webhook URL, bonus değişim eşiği, digest saati ve sistem on/off."
            />
          </CardHeader>
          <CardContent>
            {settingsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Yükleniyor…
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  saveMutation.mutate()
                }}
                className="space-y-5"
              >
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">
                    Slack Webhook URL
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://hooks.slack.com/services/..."
                      value={draftUrl}
                      onChange={(e) => setDraftUrl(e.target.value)}
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => testMutation.mutate()}
                      disabled={testDisabled}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      {testMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Test Et
                    </button>
                  </div>
                  {testFeedback && (
                    <p
                      className={cn(
                        'text-xs mt-1',
                        testFeedback.type === 'ok' ? 'text-emerald-600' : 'text-red-600'
                      )}
                    >
                      {testFeedback.message}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Boş bırakılabilir; webhook girilmediği sürece scraper Slack push&apos;unu skip eder.
                  </p>
                </label>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Bonus değişim eşiği
                      </span>
                      <span className="text-sm font-mono font-medium">
                        %{draftThreshold}
                      </span>
                    </div>
                    <Slider
                      min={10}
                      max={50}
                      step={1}
                      value={[draftThreshold]}
                      onValueChange={(v) => setDraftThreshold(v[0])}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Bu yüzdeden büyük bonus değişimleri smart_alerts tablosuna yazılır.
                      &gt;%50 ise <span className="font-mono">high</span>, &gt;eşik ise{' '}
                      <span className="font-mono">medium</span>.
                    </p>
                  </div>

                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Digest saati (UTC)</span>
                    <select
                      value={draftDigestHour}
                      onChange={(e) => setDraftDigestHour(Number(e.target.value))}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}:00 UTC
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      Medium severity günlük digest, low severity Pazartesi haftalık digest bu
                      saatte gönderilir.
                    </p>
                  </label>
                </div>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={draftEnabled}
                    onChange={(e) => setDraftEnabled(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">
                    Smart Alert sistemi <span className="font-medium">açık</span>
                  </span>
                </label>

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/60">
                  <div className="text-[11px] text-muted-foreground">
                    {settings?.updatedAt
                      ? `Son güncelleme: ${formatDate(settings.updatedAt)}`
                      : 'Henüz kayıt yok.'}
                  </div>
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    Kaydet
                  </button>
                </div>

                {saveError && <p className="text-xs text-red-600">{saveError}</p>}
              </form>
            )}
          </CardContent>
        </Card>

        {/* Alerts table */}
        <Card>
          <CardHeader>
            <SectionHeader
              title="Son Alert'ler"
              description="En son 50 smart_alerts kaydı. Filtreler URL'e yansımaz, sadece görünüm için."
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Tüm Tipler</option>
                    <option value="bonus_change">Bonus Değişimi</option>
                    <option value="category_change">Kategori</option>
                    <option value="new_campaign">Yeni Kampanya</option>
                    <option value="kvkk_change">KVKK</option>
                  </select>
                  <select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Tüm Severity</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select
                    value={filterPushed}
                    onChange={(e) => setFilterPushed(e.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Hepsi</option>
                    <option value="0">Bekleyen</option>
                    <option value="1">Push Edilmiş</option>
                  </select>
                </div>
              }
            />
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {alertsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !alertsQuery.data || alertsQuery.data.alerts.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="Alert yok"
                description={
                  alertsQuery.data?.migrationPending
                    ? 'Migration 017 henüz uygulanmadı.'
                    : 'Filtreye uyan alert bulunamadı.'
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Tip</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Başlık</TableHead>
                    <TableHead className="text-right">Slack</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertsQuery.data.alerts.map((row) => {
                    const url = (row.payload?.campaign_url as string | undefined) ?? null
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(row.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {TYPE_LABEL[row.alertType] ?? row.alertType}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                              SEVERITY_BADGE[row.severity]
                            )}
                          >
                            {row.severity}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.siteName ?? row.siteCode ?? '-'}
                        </TableCell>
                        <TableCell className="max-w-[420px]">
                          <div className="text-sm font-medium truncate">{row.title ?? '-'}</div>
                          {row.description && (
                            <div className="text-xs text-muted-foreground truncate">
                              {row.description}
                            </div>
                          )}
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Kampanya linki
                            </a>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.pushedToSlack ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {formatDate(row.pushedToSlackAt)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Bekliyor</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
