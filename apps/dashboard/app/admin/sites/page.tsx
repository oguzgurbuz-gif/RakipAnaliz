'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { Loader2, RefreshCw, Power } from 'lucide-react'
import { fetchAdminSites, toggleAdminSite, type AdminSite } from '@/lib/api'

function formatDateTime(value: string | null): string {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('tr-TR')
  } catch {
    return value
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function statusBadgeClass(status: string | null): string {
  switch (status) {
    case 'completed':
    case 'success':
      return 'bg-green-100 text-green-800'
    case 'failed':
    case 'error':
      return 'bg-red-100 text-red-800'
    case 'running':
      return 'bg-blue-100 text-blue-800'
    case 'pending':
      return 'bg-yellow-100 text-yellow-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export default function AdminSitesPage() {
  const queryClient = useQueryClient()
  const [pendingCode, setPendingCode] = React.useState<string | null>(null)
  const [actionMessage, setActionMessage] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery<AdminSite[]>({
    queryKey: ['admin-sites-list'],
    queryFn: fetchAdminSites,
    refetchInterval: 15000,
  })

  const handleToggle = async (site: AdminSite) => {
    setActionError(null)
    setActionMessage(null)
    setPendingCode(site.code)
    try {
      const result = await toggleAdminSite(site.code, !site.isActive)
      setActionMessage(
        result.changed
          ? `${result.siteName}: ${result.isActive ? 'aktifleştirildi' : 'devre dışı bırakıldı'}`
          : `${result.siteName}: durum zaten ${result.isActive ? 'aktif' : 'pasif'}`
      )
      await queryClient.invalidateQueries({ queryKey: ['admin-sites-list'] })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Toggle başarısız')
    } finally {
      setPendingCode(null)
    }
  }

  const sites = data ?? []
  const activeCount = sites.filter((s) => s.isActive).length
  const inactiveCount = sites.length - activeCount

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Site Yönetimi"
        description="Aktif siteleri devre dışı bırakın veya yeniden açın. Son scrape zamanı ve durumu da burada görünür."
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
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Toplam Site</div>
              <div className="text-2xl font-bold">{sites.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Aktif</div>
              <div className="text-2xl font-bold text-green-600">{activeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Pasif</div>
              <div className="text-2xl font-bold text-muted-foreground">{inactiveCount}</div>
            </CardContent>
          </Card>
        </div>

        {(actionMessage || actionError) && (
          <Card>
            <CardContent className="p-4 space-y-1">
              {actionMessage && <p className="text-sm text-green-600">{actionMessage}</p>}
              {actionError && <p className="text-sm text-red-600">{actionError}</p>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <SectionHeader
              title="Siteler"
              description="Toggle ile siteyi aktif/pasif yap. Pasif siteler scheduled scrape döngülerinden hariç tutulur."
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
                      <TableHead>Site</TableHead>
                      <TableHead>Kod</TableHead>
                      <TableHead className="text-right">Önc.</TableHead>
                      <TableHead className="text-right">Kampanya</TableHead>
                      <TableHead>Son Scrape</TableHead>
                      <TableHead>Son Durum</TableHead>
                      <TableHead>Süre</TableHead>
                      <TableHead className="text-right">Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sites.map((site) => (
                      <TableRow key={site.id}>
                        <TableCell className="font-medium">{site.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {site.code}
                        </TableCell>
                        <TableCell className="text-right">{site.priority}</TableCell>
                        <TableCell className="text-right">{site.campaignCount}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDateTime(site.lastScrapedAt)}
                        </TableCell>
                        <TableCell>
                          {site.lastScrapeStatus ? (
                            <Badge className={statusBadgeClass(site.lastScrapeStatus)}>
                              {site.lastScrapeStatus}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                          {site.lastScrapeError && (
                            <div className="mt-1 max-w-[260px] truncate text-xs text-red-600">
                              {site.lastScrapeError}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDuration(site.lastScrapeDuration)}
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            type="button"
                            onClick={() => handleToggle(site)}
                            disabled={pendingCode === site.code}
                            aria-label={site.isActive ? 'Devre dışı bırak' : 'Aktifleştir'}
                            className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
                              site.isActive
                                ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                                : 'border-border bg-background text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {pendingCode === site.code ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Power className="h-3 w-3" />
                            )}
                            {site.isActive ? 'Aktif' : 'Pasif'}
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {sites.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          Site bulunamadı
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
