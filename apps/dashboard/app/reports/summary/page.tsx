'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/ui/error'
import { ReportSummaryComponent } from '@/components/reports/report-summary'
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
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
        <h1 className="text-lg font-semibold">Rapor Özeti</h1>
      </header>

      <main className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Başlangıç:</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Bitiş:</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Yenile
          </Button>
        </div>

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
