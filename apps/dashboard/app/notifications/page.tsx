'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CheckCheck,
  Archive,
  AlertTriangle,
  Activity,
  Sparkles,
  CalendarClock,
  FileText,
  Loader2,
  RefreshCw,
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
import { cn } from '@/lib/utils'
import {
  fetchNotifications,
  markNotificationsRead,
  archiveNotifications,
  type NotificationItem,
  type NotificationFilters,
} from '@/lib/api'
import { useSSE } from '@/lib/sse'

const TYPE_LABEL: Record<string, string> = {
  smart_alert: 'Smart Alert',
  momentum_shift: 'Momentum Değişimi',
  new_competitor: 'Yeni Rakip',
  campaign_end: 'Kampanya Bitiyor',
  weekly_report_ready: 'Haftalık Rapor',
  system: 'Sistem',
}

const SEVERITY_BADGE: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700 border-slate-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  high: 'bg-red-100 text-red-800 border-red-200',
  critical: 'bg-red-200 text-red-900 border-red-300',
}

const NOTIF_ICON: Record<string, React.ElementType> = {
  smart_alert: AlertTriangle,
  momentum_shift: Activity,
  new_competitor: Sparkles,
  campaign_end: CalendarClock,
  weekly_report_ready: FileText,
  system: Bell,
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('tr-TR')
  } catch {
    return iso
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000)
  if (diffSec < 60) return 'az önce'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} dk önce`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `${diffHour} sa önce`
  const diffDay = Math.round(diffHour / 24)
  if (diffDay < 7) return `${diffDay} gün önce`
  return d.toLocaleDateString('tr-TR')
}

const PAGE_SIZE = 25

export default function NotificationsPage() {
  const queryClient = useQueryClient()

  const [unreadOnly, setUnreadOnly] = React.useState(false)
  const [severity, setSeverity] = React.useState<string>('')
  const [type, setType] = React.useState<string>('')
  const [from, setFrom] = React.useState<string>('')
  const [to, setTo] = React.useState<string>('')
  const [page, setPage] = React.useState(1)

  // Filtre değişince ilk sayfaya dön.
  React.useEffect(() => {
    setPage(1)
  }, [unreadOnly, severity, type, from, to])

  const filters: NotificationFilters = {
    unread: unreadOnly || undefined,
    severity: severity || undefined,
    type: type || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: PAGE_SIZE,
  }

  const listQuery = useQuery({
    queryKey: ['notifications-list', filters],
    queryFn: () => fetchNotifications(filters),
  })

  // Wave 4 — yeni notification SSE event'i geldiğinde tabloyu da invalide et.
  useSSE({
    onEvent: (event) => {
      if (event.type === 'notification_created') {
        queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      }
    },
  })

  const markReadMutation = useMutation({
    mutationFn: (input: { id?: string; ids?: string[]; all?: boolean }) =>
      markNotificationsRead(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-recent'] })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (input: { id?: string; ids?: string[] }) =>
      archiveNotifications(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-recent'] })
    },
  })

  const items = listQuery.data?.items ?? []
  const meta = listQuery.data?.meta
  const migrationPending = listQuery.data?.migrationPending ?? false

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Bildirimler"
        description="Smart alert, momentum değişimi, kampanya sonu ve haftalık rapor olaylarının birleşik kutusu."
        actions={
          <>
            <button
              onClick={() => listQuery.refetch()}
              disabled={listQuery.isFetching}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw
                className={cn('h-4 w-4', listQuery.isFetching && 'animate-spin')}
              />
              Yenile
            </button>
            <button
              onClick={() => markReadMutation.mutate({ all: true })}
              disabled={markReadMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              {markReadMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              Tümünü okundu işaretle
            </button>
          </>
        }
      />

      <main className="space-y-6 p-6">
        {migrationPending && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800">
                Migration #023 henüz uygulanmadı
              </p>
              <p className="text-amber-700/90 mt-0.5">
                <code>notifications</code> tablosu yok. Scraper&apos;ı yeniden
                başlatın — migration otomatik uygulanır.
              </p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <SectionHeader
              title="Filtreler"
              description="URL'e yansımaz, sadece görünüm için."
            />
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(e) => setUnreadOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                Sadece okunmamış
              </label>

              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">
                  Tip
                </span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">Tümü</option>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">
                  Severity
                </span>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">Tümü</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">
                  Başlangıç
                </span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">
                  Bitiş
                </span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </label>

              <button
                onClick={() => {
                  setUnreadOnly(false)
                  setSeverity('')
                  setType('')
                  setFrom('')
                  setTo('')
                }}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
              >
                Temizle
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeader
              title="Bildirim Listesi"
              description={
                meta
                  ? `Toplam ${meta.total} kayıt — Sayfa ${meta.page}/${meta.totalPages || 1}`
                  : '—'
              }
            />
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {listQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="Bildirim yok"
                description={
                  migrationPending
                    ? 'Migration 023 henüz uygulanmadı.'
                    : 'Filtreye uyan bildirim bulunamadı.'
                }
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Başlık / Mesaj</TableHead>
                      <TableHead>Tip</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead className="text-right">Aksiyonlar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((notif: NotificationItem) => {
                      const Icon = NOTIF_ICON[notif.notificationType] ?? Bell
                      const isUnread = !notif.readAt
                      return (
                        <TableRow
                          key={notif.id}
                          className={cn(isUnread && 'bg-blue-50/30 dark:bg-blue-950/10')}
                        >
                          <TableCell className="align-top">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </TableCell>
                          <TableCell className="max-w-[520px]">
                            <div
                              className={cn(
                                'text-sm line-clamp-1',
                                isUnread ? 'font-semibold' : 'font-medium'
                              )}
                            >
                              {notif.linkUrl ? (
                                <Link
                                  href={notif.linkUrl}
                                  onClick={() => {
                                    if (isUnread) {
                                      markReadMutation.mutate({ id: notif.id })
                                    }
                                  }}
                                  className="hover:underline"
                                >
                                  {notif.title}
                                </Link>
                              ) : (
                                notif.title
                              )}
                            </div>
                            {notif.message && (
                              <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {notif.message}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {TYPE_LABEL[notif.notificationType] ?? notif.notificationType}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                                SEVERITY_BADGE[notif.severity] ?? SEVERITY_BADGE.low
                              )}
                            >
                              {notif.severity}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            <div>{formatRelative(notif.createdAt)}</div>
                            <div className="text-[10px] opacity-70">
                              {formatAbsolute(notif.createdAt)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {isUnread && (
                                <button
                                  onClick={() =>
                                    markReadMutation.mutate({ id: notif.id })
                                  }
                                  disabled={markReadMutation.isPending}
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  title="Okundu işaretle"
                                >
                                  <CheckCheck className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  archiveMutation.mutate({ id: notif.id })
                                }
                                disabled={archiveMutation.isPending}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="Arşivle"
                              >
                                <Archive className="h-4 w-4" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                {meta && meta.totalPages > 1 && (
                  <div className="flex items-center justify-between gap-3 mt-4">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1 || listQuery.isFetching}
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      ← Önceki
                    </button>
                    <span className="text-xs text-muted-foreground">
                      Sayfa {meta.page} / {meta.totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setPage((p) =>
                          meta.totalPages > 0 ? Math.min(meta.totalPages, p + 1) : p + 1
                        )
                      }
                      disabled={page >= meta.totalPages || listQuery.isFetching}
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      Sonraki →
                    </button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
