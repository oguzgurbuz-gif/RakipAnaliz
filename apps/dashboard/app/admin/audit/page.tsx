'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { DateRangePickerHeader } from '@/components/ui/date-range-picker-header'
import { useDateRange } from '@/lib/date-range/context'
import { Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchAdminAuditLogs, type AuditLogPage } from '@/lib/api'

const PAGE_SIZE = 100

const ACTION_OPTIONS = [
  { value: '', label: 'Tüm aksiyonlar' },
  { value: 'site.toggle', label: 'site.toggle' },
  { value: 'job.retry', label: 'job.retry' },
  { value: 'scrape.trigger', label: 'scrape.trigger' },
  { value: 'ai.reindex', label: 'ai.reindex' },
  { value: 'campaign.status.recalc', label: 'campaign.status.recalc' },
]

const RESOURCE_OPTIONS = [
  { value: '', label: 'Tüm kaynaklar' },
  { value: 'site', label: 'site' },
  { value: 'job', label: 'job' },
  { value: 'scrape_run', label: 'scrape_run' },
  { value: 'campaign', label: 'campaign' },
  { value: 'system', label: 'system' },
]

function formatDateTime(value: string | null): string {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('tr-TR')
  } catch {
    return value
  }
}

function shortJson(value: unknown): string {
  if (value === null || value === undefined) return '-'
  try {
    const str = typeof value === 'string' ? value : JSON.stringify(value)
    return str.length > 240 ? `${str.slice(0, 237)}…` : str
  } catch {
    return String(value)
  }
}

/**
 * Local YYYY-MM-DD → "YYYY-MM-DD HH:mm:ss" sınır değeri.
 *
 * Audit API `created_at >= $1` ve `created_at <= $2` kullandığı için sadece
 * tarih gönderilirse "to" günü kapsam dışı kalır; burada açık olarak
 * 00:00:00 / 23:59:59 ekliyoruz. Tek boşluk garantisi → SQL boşluk bug
 * riski olan değerler oluşmaz.
 */
function toApiBoundary(value: string, isEnd: boolean): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}/.test(value)) return value.replace('T', ' ')
  return isEnd ? `${value} 23:59:59` : `${value} 00:00:00`
}

export default function AdminAuditPage() {
  const { from, to, applyPreset, preset } = useDateRange('admin-audit')
  const [actionFilter, setActionFilter] = React.useState('')
  const [resourceFilter, setResourceFilter] = React.useState('')
  const [page, setPage] = React.useState(1)

  // Tarih veya filtre değişince ilk sayfaya dön.
  React.useEffect(() => {
    setPage(1)
  }, [from, to, actionFilter, resourceFilter])

  const apiFrom = from ? toApiBoundary(from, false) : undefined
  const apiTo = to ? toApiBoundary(to, true) : undefined

  const { data, isLoading, refetch, isFetching } = useQuery<AuditLogPage>({
    queryKey: ['admin-audit', { actionFilter, resourceFilter, apiFrom, apiTo, page }],
    queryFn: () =>
      fetchAdminAuditLogs({
        page,
        pageSize: PAGE_SIZE,
        action: actionFilter || undefined,
        resourceType: resourceFilter || undefined,
        from: apiFrom,
        to: apiTo,
      }),
    refetchInterval: 30000,
  })

  const items = data?.data?.items ?? []
  const meta = data?.meta ?? { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 }
  const migrationPending = data?.data?.migrationPending ?? false
  const totalPages = Math.max(1, meta.totalPages || 1)

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Audit Log"
        description="Admin aksiyonlarının (toggle, retry, scrape trigger, AI reindex) izlenebilir kaydı."
        actions={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        }
      />

      <main className="space-y-6 p-6">
        {/* Global tarih aralığı + sayfa-spesifik hızlı erişim chip'leri.
            "Son 24 Saat" persistence katmanı YYYY-MM-DD tuttuğu için
            pratikte "today" preset'ine eşleniyor (gün bazında zaten 24h
            penceresi). "Son 7 Gün" zaten DateRangePickerHeader içinde de var
            ama hızlı erişim için burada tekrar gösteriyoruz. */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[280px]">
            <DateRangePickerHeader scope="admin-audit" />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => applyPreset('today')}
              aria-pressed={preset === 'today'}
              className={cn(
                'inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium transition-colors',
                'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                preset === 'today' &&
                  'border-primary/60 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
              )}
              title="Bugünün audit kayıtları"
            >
              Son 24 Saat
            </button>
            <button
              type="button"
              onClick={() => applyPreset('last7d')}
              aria-pressed={preset === 'last7d'}
              className={cn(
                'inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium transition-colors',
                'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                preset === 'last7d' &&
                  'border-primary/60 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
              )}
            >
              Son 7 Gün
            </button>
          </div>
        </div>

        {migrationPending && (
          <Card>
            <CardContent className="p-4 text-sm text-amber-700">
              <strong>Migration 015_admin_logs.sql</strong> henüz uygulanmamış görünüyor.
              Tablo oluşturulduktan sonra log kayıtları burada listelenecek.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <SectionHeader title="Filtreler" description="Aksiyon ve kaynak tipine göre filtreleyin." />
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Aksiyon</label>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  {ACTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Kaynak Tipi</label>
                <select
                  value={resourceFilter}
                  onChange={(e) => setResourceFilter(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  {RESOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeader
              title="Kayıtlar"
              description={`Toplam ${meta.total} kayıt — sayfa ${meta.page}/${totalPages}`}
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
                      <TableHead>Tarih</TableHead>
                      <TableHead>Aktör</TableHead>
                      <TableHead>Aksiyon</TableHead>
                      <TableHead>Kaynak</TableHead>
                      <TableHead>Kaynak ID</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Değişiklikler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(entry.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge className="bg-gray-100 text-gray-800">{entry.actor}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                        <TableCell className="text-xs">{entry.resourceType}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {entry.resourceId ? `${entry.resourceId.slice(0, 8)}…` : '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{entry.ip ?? '-'}</TableCell>
                        <TableCell className="max-w-[420px] text-xs text-muted-foreground">
                          <details>
                            <summary className="cursor-pointer truncate">{shortJson(entry.changes)}</summary>
                            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-snug">
                              {JSON.stringify(entry.changes, null, 2)}
                            </pre>
                          </details>
                        </TableCell>
                      </TableRow>
                    ))}
                    {items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {migrationPending
                            ? 'Tablo henüz oluşturulmamış.'
                            : 'Bu filtrelerle eşleşen kayıt bulunamadı.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
              >
                <ChevronLeft className="h-3 w-3" />
                Önceki
              </button>
              <span className="text-xs text-muted-foreground">
                Sayfa {meta.page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages || isFetching}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
              >
                Sonraki
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
