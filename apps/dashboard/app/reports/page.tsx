'use client'

import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { InsightCard } from '@/components/ui/insight-card'
import { ReportSummaryComponent } from '@/components/reports/report-summary'
import { WeeklyReportCard } from '@/components/reports/weekly-report-card'
import { AutoAnalysisCard } from '@/components/reports/auto-analysis-card'
import { DateRangePickerHeader } from '@/components/ui/date-range-picker-header'
import { useDateRange } from '@/lib/date-range/context'
import { toIsoDate } from '@/lib/date-range/presets'
import { cn } from '@/lib/utils'
import {
  buildWeeklyReportsCsvUrl,
  fetchWeeklyReportsFiltered,
  fetchReportSummary,
} from '@/lib/api'
import {
  Download,
  CalendarRange,
  FileClock,
  Globe,
  Megaphone,
  BarChart3,
  Calendar,
} from 'lucide-react'

type Tab = 'summary' | 'weekly'

/**
 * Verilen "şimdi" değerine göre bir önceki ISO haftasının (Pzt → Paz)
 * `from` / `to` aralığını döndürür. Reports scope'u `thisWeek` default
 * kullandığı için "Geçen Hafta" chip'i tek tıkla bir önceki haftaya atlar.
 */
function getPreviousWeekRange(now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const day = today.getDay()
  // Bu haftanın pazartesini bul (Pazar=0, Pzt=1 ...)
  const diffToMonday = day === 0 ? 6 : day - 1
  const thisMonday = new Date(today)
  thisMonday.setDate(today.getDate() - diffToMonday)
  // 7 gün geri = geçen pazartesi
  const prevMonday = new Date(thisMonday)
  prevMonday.setDate(thisMonday.getDate() - 7)
  const prevSunday = new Date(prevMonday)
  prevSunday.setDate(prevMonday.getDate() + 6)
  return { from: toIsoDate(prevMonday), to: toIsoDate(prevSunday) }
}

/**
 * Bir önceki takvim ayının ilk → son gününü döndürür.
 */
function getPreviousMonthRange(now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const last = new Date(today.getFullYear(), today.getMonth(), 0)
  return { from: toIsoDate(first), to: toIsoDate(last) }
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('summary')
  const { from: dateFrom, to: dateTo, setRange } = useDateRange('reports')

  const {
    data: summaryData,
    isLoading: summaryLoading,
  } = useQuery({
    queryKey: ['report-summary', dateFrom, dateTo],
    queryFn: () => fetchReportSummary(dateFrom || undefined, dateTo || undefined),
  })

  const { data: weeklyData, isLoading: weeklyLoading } = useQuery({
    queryKey: ['weekly-reports', dateFrom, dateTo],
    queryFn: () =>
      fetchWeeklyReportsFiltered({
        from: dateFrom || undefined,
        to: dateTo || undefined,
      }),
  })

  const exportCSV = useCallback(() => {
    const url = buildWeeklyReportsCsvUrl({
      from: dateFrom || undefined,
      to: dateTo || undefined,
    })
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [dateFrom, dateTo])

  const applyPreviousWeek = useCallback(() => {
    const { from, to } = getPreviousWeekRange()
    setRange(from, to)
  }, [setRange])

  const applyPreviousMonth = useCallback(() => {
    const { from, to } = getPreviousMonthRange()
    setRange(from, to)
  }, [setRange])

  const latestReport = weeklyData?.[0]
  const totalCampaigns = weeklyData?.reduce((sum, report) => sum + report.campaignCount, 0) ?? 0
  const hasReports = !!weeklyData && weeklyData.length > 0

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Raporlar"
        description="Haftalık ve özet raporlarla kampanya performansını takip edin."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={!hasReports}
            title={hasReports ? 'CSV olarak indir' : 'İndirilecek rapor yok'}
          >
            <Download className="h-4 w-4 mr-1" />
            CSV İndir
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

      <main className="p-6 space-y-4">
        {/* Global tarih aralığı header'ı + reports'a özel ek chip'ler */}
        <DateRangePickerHeader scope="reports" />
        <ReportsExtraPresetChips
          onPreviousWeek={applyPreviousWeek}
          onPreviousMonth={applyPreviousMonth}
        />

        {/* Summary Tab */}
        {activeTab === 'summary' && (
          <div>
            {summaryLoading ? (
              <div className="grid gap-4 md:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="h-16 bg-muted animate-pulse rounded" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <ReportSummaryComponent data={summaryData ?? null} showDetails />
            )}
          </div>
        )}

        {activeTab === 'weekly' && (
          <>
            {/* D6 — Otomatik AI rapor. Seçili aralıkta kayıtlı weekly_report
                yoksa gösterilir (hideIfExistingReport). Veri hazır değilse
                "scrape devam ediyor" mesajı, AI başarısızsa "Tekrar dene"
                butonu kartın kendi içinde handle edilir. */}
            {dateFrom && dateTo && (
              <AutoAnalysisCard
                from={dateFrom}
                to={dateTo}
                hideIfExistingReport={hasReports}
              />
            )}

            {/* Stats */}
            {!weeklyLoading && hasReports && (
              <div className="grid gap-4 md:grid-cols-4">
                <InsightCard
                  icon={FileClock}
                  title="Toplam Rapor"
                  value={weeklyData!.length}
                  description="Seçili aralıktaki rapor"
                />
                <InsightCard
                  icon={Megaphone}
                  title="Toplam Kampanya"
                  value={totalCampaigns}
                  description="Raporların kapsadığı hacim"
                />
                <InsightCard
                  icon={Globe}
                  title="Son Site Kapsamı"
                  value={latestReport?.siteCoverageCount ?? 0}
                  description="En güncel rapor"
                  tone="info"
                />
                <InsightCard
                  icon={CalendarRange}
                  title="Son Aktif Hacim"
                  value={latestReport?.activeOverlapCount ?? 0}
                  description="Aktif kampanya"
                  tone="positive"
                />
              </div>
            )}

            {weeklyLoading ? (
              <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-32 rounded-lg border bg-card animate-pulse"
                  />
                ))}
              </div>
            ) : hasReports ? (
              <div className="grid gap-4 md:grid-cols-3">
                {weeklyData!.map((report) => (
                  <WeeklyReportCard key={report.id} report={report} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FileClock}
                title="Bu aralıkta haftalık rapor yok"
                description="Seçili tarih aralığında üretilmiş bir haftalık rapor bulunmuyor. Önceki dönemi göstererek geçmiş haftalara bakabilirsiniz."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={applyPreviousWeek}>
                      Önceki haftayı göster
                    </Button>
                    <Button variant="ghost" size="sm" onClick={applyPreviousMonth}>
                      Önceki ayı göster
                    </Button>
                  </div>
                }
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

/**
 * Reports sayfasına özel ek preset chip'leri.
 *
 * Global `DateRangePickerHeader`'a değil, sadece bu sayfaya eklenir; çünkü
 * "Geçen Hafta" / "Geçen Ay" yalnızca rapor karşılaştırma akışı için anlamlı.
 */
function ReportsExtraPresetChips({
  onPreviousWeek,
  onPreviousMonth,
}: {
  onPreviousWeek: () => void
  onPreviousMonth: () => void
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs"
      role="group"
      aria-label="Hızlı geçmiş aralıklar"
    >
      <span className="text-muted-foreground">Hızlı geçmiş:</span>
      <button
        type="button"
        onClick={onPreviousWeek}
        className={cn(
          'inline-flex items-center rounded-sm border px-2 py-1 font-medium transition-colors',
          'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )}
      >
        Geçen Hafta
      </button>
      <button
        type="button"
        onClick={onPreviousMonth}
        className={cn(
          'inline-flex items-center rounded-sm border px-2 py-1 font-medium transition-colors',
          'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )}
      >
        Geçen Ay
      </button>
    </div>
  )
}
