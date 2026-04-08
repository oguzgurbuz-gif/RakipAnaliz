'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/ui/error'
import { ReportSummaryComponent } from '@/components/reports/report-summary'
import { PageHeader } from '@/components/ui/page-header'
import { fetchReportSummary } from '@/lib/api'

export default function ReportsSummaryPage() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-summary', dateFrom, dateTo],
    queryFn: () => fetchReportSummary(dateFrom || undefined, dateTo || undefined),
  })

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Rapor Özeti"
        description="Seçilen tarih aralığındaki kampanya hareketini, kategori yoğunluğunu ve site görünürlüğünü özetleyen yönetici görünümü."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Yenile
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <label className="font-medium">Başlangıç</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40 bg-background"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="font-medium">Bitiş</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40 bg-background"
            />
          </div>
        </div>
      </PageHeader>

      <main className="p-6 space-y-6">
        {error && <ErrorDisplay error={error} onRetry={() => refetch()} />}

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          </div>
        ) : (
          <ReportSummaryComponent data={data ?? null} showDetails />
        )}
      </main>
    </div>
  )
}
