'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDisplay } from '@/components/ui/error'
import { InsightCard } from '@/components/ui/insight-card'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { StatusBadge } from '@/components/campaign/status-badge'
import { fetchScrapeRuns } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import { RefreshCw, CheckCircle, XCircle, Clock, Activity, ShieldAlert, Database } from 'lucide-react'

export default function ScrapeRunsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['scrape-runs'],
    queryFn: fetchScrapeRuns,
  })

  const completedCount = data?.filter((run) => run.status === 'completed').length ?? 0
  const failedCount = data?.filter((run) => run.status === 'failed').length ?? 0
  const runningCount = data?.filter((run) => run.status === 'running').length ?? 0
  const totalInserted = data?.reduce((sum, run) => sum + (run.insertedCount || 0), 0) ?? 0

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
      <PageHeader
        title="Scrape İşlemleri"
        description="Toplama süreçlerinin durumunu, hata eğilimlerini ve son işlenen hacmi operasyonel olarak takip edin."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Yenile
          </Button>
        }
      >
        <div className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
          Toplam koşu: {data?.length ?? 0}
        </div>
      </PageHeader>

      <main className="space-y-6 p-6">
        {error && <ErrorDisplay error={error} onRetry={() => refetch()} />}

        {!isLoading && data && data.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InsightCard icon={CheckCircle} title="Tamamlanan" value={completedCount} description="Başarıyla biten scrape çalışmaları" tone="positive" />
            <InsightCard icon={ShieldAlert} title="Başarısız" value={failedCount} description="Hata üreten veya yarıda kalan işler" tone="warning" />
            <InsightCard icon={Activity} title="Çalışan" value={runningCount} description="Şu anda devam eden iş sayısı" tone="info" />
            <InsightCard icon={Database} title="Yeni Kayıt" value={totalInserted} description="Koşular boyunca eklenen toplam kampanya" />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <div className="space-y-4">
            <SectionHeader
              title="İşlem Zaman Çizelgesi"
              description="Her scrape çalışmasının durumunu, kampanya hacmini ve hata ayrıntılarını tek akışta görün."
            />
            {data.map((run) => (
              <Card key={run.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex items-start gap-4">
                      {getStatusIcon(run.status)}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{run.site?.name || run.siteId}</span>
                          <StatusBadge status={run.status} />
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {run.runType}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <span>Başlangıç: {formatDateTime(run.startedAt)}</span>
                          {run.completedAt && (
                            <span className="ml-4">Bitiş: {formatDateTime(run.completedAt)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm xl:min-w-[340px]">
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
                    <details className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                      <summary className="cursor-pointer font-medium">Hata Detayını Göster</summary>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm">{run.error}</p>
                    </details>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Clock}
            title="Henüz scrape işlemi bulunmuyor"
            description="Çalıştırılan işler burada zaman çizelgesi şeklinde listelenecek."
          />
        )}
      </main>
    </div>
  )
}
