'use client'

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { WeeklyReportCard } from '@/components/reports/weekly-report-card'
import { WowComparison } from '@/components/reports/wow-comparison'
import { ErrorDisplay } from '@/components/ui/error'
import { EmptyState } from '@/components/ui/empty-state'
import { InsightCard } from '@/components/ui/insight-card'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { DateRangePickerHeader } from '@/components/ui/date-range-picker-header'
import { useDateRange } from '@/lib/date-range/context'
import { toIsoDate } from '@/lib/date-range/presets'
import { cn } from '@/lib/utils'
import {
  buildWeeklyReportsCsvUrl,
  fetchWeeklyReportsFiltered,
} from '@/lib/api'
import { CalendarRange, Download, FileClock, Globe, Megaphone } from 'lucide-react'

/**
 * Bir önceki ISO haftası (Pzt → Paz) — "Geçen Hafta" chip'i için.
 */
function getPreviousWeekRange(now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const day = today.getDay()
  const diffToMonday = day === 0 ? 6 : day - 1
  const thisMonday = new Date(today)
  thisMonday.setDate(today.getDate() - diffToMonday)
  const prevMonday = new Date(thisMonday)
  prevMonday.setDate(thisMonday.getDate() - 7)
  const prevSunday = new Date(prevMonday)
  prevSunday.setDate(prevMonday.getDate() + 6)
  return { from: toIsoDate(prevMonday), to: toIsoDate(prevSunday) }
}

function getPreviousMonthRange(now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const last = new Date(today.getFullYear(), today.getMonth(), 0)
  return { from: toIsoDate(first), to: toIsoDate(last) }
}

export default function WeeklyReportsPage() {
  const { from: dateFrom, to: dateTo, setRange } = useDateRange('reports')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['weekly-reports', dateFrom, dateTo],
    queryFn: () =>
      fetchWeeklyReportsFiltered({
        from: dateFrom || undefined,
        to: dateTo || undefined,
      }),
  })

  const latestReport = data?.[0]
  const totalCampaigns = data?.reduce((sum, report) => sum + report.campaignCount, 0) ?? 0
  const hasReports = !!data && data.length > 0

  const handleDownloadCsv = useCallback(() => {
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

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader
          title="Haftalık Raporlar"
          description="Her hafta için öne çıkan değişimleri, riskleri ve rakip görünürlüğünü takip edin."
        />
        <main className="p-6">
          <ErrorDisplay error={error} onRetry={() => refetch()} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Haftalık Raporlar"
        description="Zaman içindeki kampanya ritmini haftalık özetler halinde izleyin; hangi haftanın açılmaya değer olduğunu ilk bakışta görün."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadCsv}
            disabled={!hasReports}
            title={hasReports ? 'CSV olarak indir' : 'İndirilecek rapor yok'}
          >
            <Download className="h-4 w-4 mr-1" />
            CSV İndir
          </Button>
        }
      >
        {latestReport && (
          <div className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
            Son rapor: Hafta {latestReport.weekNumber} / {latestReport.year}
          </div>
        )}
      </PageHeader>

      <main className="space-y-4 p-6">
        {/* Global tarih aralığı header'ı (URL ?from=&to= sync W4-A tarafında halloldu) */}
        <DateRangePickerHeader scope="reports" />

        {/* Reports'a özel ek preset chip'leri */}
        <div
          className="flex flex-wrap items-center gap-2 text-xs"
          role="group"
          aria-label="Hızlı geçmiş aralıklar"
        >
          <span className="text-muted-foreground">Hızlı geçmiş:</span>
          <button
            type="button"
            onClick={applyPreviousWeek}
            className={cn(
              'inline-flex items-center rounded-sm border px-2 py-1 font-medium transition-colors',
              'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            Geçen Hafta
          </button>
          <button
            type="button"
            onClick={applyPreviousMonth}
            className={cn(
              'inline-flex items-center rounded-sm border px-2 py-1 font-medium transition-colors',
              'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            Geçen Ay
          </button>
        </div>

        {data && data.length >= 2 && <WowComparison reports={data} />}

        {!isLoading && hasReports && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InsightCard
              icon={FileClock}
              title="Toplam Rapor"
              value={data!.length}
              description="Seçili aralıktaki rapor sayısı"
            />
            <InsightCard
              icon={Megaphone}
              title="Toplam Kampanya"
              value={totalCampaigns}
              description="Raporların kapsadığı toplam kampanya hacmi"
            />
            <InsightCard
              icon={Globe}
              title="Son Site Kapsamı"
              value={latestReport?.siteCoverageCount ?? 0}
              description="En güncel raporda izlenen site sayısı"
              tone="info"
            />
            <InsightCard
              icon={CalendarRange}
              title="Son Aktif Hacim"
              value={latestReport?.activeOverlapCount ?? 0}
              description="Son raporda aktif kalan kampanyalar"
              tone="positive"
            />
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 rounded-lg border bg-card animate-pulse" />
            ))}
          </div>
        ) : hasReports ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data!.map((report) => (
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
      </main>
    </div>
  )
}
