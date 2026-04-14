'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { InsightCard } from '@/components/ui/insight-card'
import { ReportSummaryComponent } from '@/components/reports/report-summary'
import { WeeklyReportCard } from '@/components/reports/weekly-report-card'
import { fetchWeeklyReports, fetchReportSummary, fetchCampaigns } from '@/lib/api'
import { Download, CalendarRange, FileClock, Globe, Megaphone, BarChart3, Calendar } from 'lucide-react'

type Tab = 'summary' | 'weekly'

export default function ReportsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState<Tab>('summary')
  const [dateFrom, setDateFrom] = useState(searchParams?.get('from') || '')
  const [dateTo, setDateTo] = useState(searchParams?.get('to') || '')

  const updateUrl = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  const { data: summaryData, isLoading: summaryLoading, refetch: summaryRefetch } = useQuery({
    queryKey: ['report-summary', dateFrom, dateTo],
    queryFn: () => fetchReportSummary(dateFrom || undefined, dateTo || undefined),
  })

  const { data: weeklyData, isLoading: weeklyLoading } = useQuery({
    queryKey: ['weekly-reports'],
    queryFn: fetchWeeklyReports,
  })

  const { data: exportData } = useQuery({
    queryKey: ['campaigns', { limit: 1000 }],
    queryFn: () => fetchCampaigns({ limit: 1000 }),
  })

  const exportCSV = () => {
    if (!exportData?.data) return
    const headers = ['title', 'site', 'category', 'sentiment', 'valid_from', 'valid_to']
    const csvRows = [
      headers.join(','),
      ...exportData.data.map(c => [
        `"${(c.title || '').replace(/"/g, '""')}"`,
        `"${(c.site?.name || '').replace(/"/g, '""')}"`,
        `"${(c.category || '').replace(/"/g, '""')}"`,
        `"${(c.sentiment || c.aiSentiment || '').replace(/"/g, '""')}"`,
        `"${(c.validFrom || '').replace(/"/g, '""')}"`,
        `"${(c.validTo || '').replace(/"/g, '""')}"`,
      ].join(','))
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rapor-kampanyalar-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const latestReport = weeklyData?.[0]
  const totalCampaigns = weeklyData?.reduce((sum, report) => sum + report.campaignCount, 0) ?? 0

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Raporlar"
        description="Haftalık ve özet raporlarla kampanya performansını takip edin."
        actions={
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        }
      />

      {/* Tabs */}
      <div className="px-6 border-b">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('summary')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'summary'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 className="h-4 w-4 inline mr-2" />
            Özet Raporu
          </button>
          <button
            onClick={() => setActiveTab('weekly')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'weekly'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Calendar className="h-4 w-4 inline mr-2" />
            Haftalık Raporlar
          </button>
        </div>
      </div>

      <main className="p-6 space-y-6">
        {/* Summary Tab */}
        {activeTab === 'summary' && (
          <>
            {/* Date filters */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Başlangıç:</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    updateUrl({ from: e.target.value || undefined })
                  }}
                  className="w-40 bg-background"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Bitiş:</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    updateUrl({ to: e.target.value || undefined })
                  }}
                  className="w-40 bg-background"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => summaryRefetch()}>
                Yenile
              </Button>
            </div>

            {summaryLoading ? (
              <div className="grid gap-4 md:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-4"><div className="h-16 bg-muted animate-pulse rounded" /></CardContent></Card>
                ))}
              </div>
            ) : (
              <ReportSummaryComponent data={summaryData ?? null} showDetails />
            )}
          </>
        )}

        {/* Weekly Tab */}
        {activeTab === 'weekly' && (
          <>
            {/* Stats */}
            {!weeklyLoading && weeklyData && weeklyData.length > 0 && (
              <div className="grid gap-4 md:grid-cols-4">
                <InsightCard icon={FileClock} title="Toplam Rapor" value={weeklyData.length} description="Arşivlenen haftalık rapor" />
                <InsightCard icon={Megaphone} title="Toplam Kampanya" value={totalCampaigns} description="Raporların kapsadığı hacim" />
                <InsightCard icon={Globe} title="Son Site Kapsamı" value={latestReport?.siteCoverageCount ?? 0} description="En güncel rapor" tone="info" />
                <InsightCard icon={CalendarRange} title="Son Aktif Hacim" value={latestReport?.activeOverlapCount ?? 0} description="Aktif kampanya" tone="positive" />
              </div>
            )}

            {weeklyLoading ? (
              <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-32 rounded-lg border bg-card animate-pulse" />
                ))}
              </div>
            ) : weeklyData && weeklyData.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-3">
                {weeklyData.map((report) => (
                  <WeeklyReportCard key={report.id} report={report} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FileClock}
                title="Henüz haftalık rapor bulunmuyor"
                description="Rapor üretildiğinde burada görünecek."
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
