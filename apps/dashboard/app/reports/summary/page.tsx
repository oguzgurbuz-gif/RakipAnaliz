'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/ui/error'
import { ReportSummaryComponent } from '@/components/reports/report-summary'
import { BrandedPdfButton } from '@/components/reports/branded-pdf-button'
import { KeyTakeaways } from '@/components/reports/key-takeaways'
import { PageHeader } from '@/components/ui/page-header'
import { fetchReportSummary, fetchCampaigns } from '@/lib/api'

export default function ReportsSummaryPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const getParam = (key: string, defaultValue: string = ''): string => {
    if (!searchParams) return defaultValue
    return searchParams.get(key) || defaultValue
  }

  const [dateFrom, setDateFrom] = useState(getParam('from'))
  const [dateTo, setDateTo] = useState(getParam('to'))

  const updateUrl = useCallback((updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }
    router.replace(`${pathname}?${params.toString()}`)
  }, [searchParams, router, pathname])

  const handleDateFromChange = (value: string) => {
    setDateFrom(value)
    updateUrl({ from: value || undefined })
  }

  const handleDateToChange = (value: string) => {
    setDateTo(value)
    updateUrl({ to: value || undefined })
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-summary', dateFrom, dateTo],
    queryFn: () => fetchReportSummary(dateFrom || undefined, dateTo || undefined),
  })

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', { limit: 1000 }],
    queryFn: () => fetchCampaigns({ limit: 1000 }),
  })

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Rapor Özeti"
        description="Seçilen tarih aralığındaki kampanya hareketini, kategori yoğunluğunu ve site görünürlüğünü özetleyen yönetici görünümü."
        actions={
          <div className="flex gap-2">
            <BrandedPdfButton data={data ?? null} dateFrom={dateFrom} dateTo={dateTo} />
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Yenile
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <label className="font-medium">Başlangıç</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="w-40 bg-background"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="font-medium">Bitiş</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
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
          <>
            <ReportSummaryComponent data={data ?? null} showDetails />
            <KeyTakeaways summaryData={data ?? null} campaigns={campaignsData?.data} />
          </>
        )}
      </main>
    </div>
  )
}
