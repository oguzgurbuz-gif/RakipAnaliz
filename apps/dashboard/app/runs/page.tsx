'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/ui/error'
import { StatusBadge } from '@/components/campaign/status-badge'
import { fetchScrapeRuns } from '@/lib/api'
import { formatDateTime, cn } from '@/lib/utils'
import { RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'

export default function ScrapeRunsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['scrape-runs'],
    queryFn: fetchScrapeRuns,
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'running':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
        <h1 className="text-lg font-semibold">Scrape İşlemleri</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Toplam: {data?.length ?? 0}
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Yenile
          </Button>
        </div>
      </header>

      <main className="p-6">
        {error && <ErrorDisplay error={error} onRetry={() => refetch()} />}

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <div className="space-y-4">
            {data.map((run) => (
              <Card key={run.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {getStatusIcon(run.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{run.site?.name || run.siteId}</span>
                          <StatusBadge status={run.status} />
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          <span>Başlangıç: {formatDateTime(run.startedAt)}</span>
                          {run.completedAt && (
                            <span className="ml-4">Bitiş: {formatDateTime(run.completedAt)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <div className="font-medium">{(run.insertedCount || 0) + (run.updatedCount || 0) + (run.skippedCount || 0)}</div>
                        <div className="text-muted-foreground">Bulunan</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-green-600">{run.insertedCount || 0}</div>
                        <div className="text-muted-foreground">Yeni</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-blue-600">{run.updatedCount || 0}</div>
                        <div className="text-muted-foreground">Güncellenen</div>
                      </div>
                    </div>
                  </div>
                  {run.error && (
                    <div className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {run.error}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            Henüz scrape işlemi bulunmuyor
          </div>
        )}
      </main>
    </div>
  )
}
