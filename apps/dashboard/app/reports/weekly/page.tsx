'use client'

import { useQuery } from '@tanstack/react-query'
import { WeeklyReportCard } from '@/components/reports/weekly-report-card'
import { ErrorDisplay } from '@/components/ui/error'
import { EmptyState } from '@/components/ui/empty-state'
import { InsightCard } from '@/components/ui/insight-card'
import { PageHeader } from '@/components/ui/page-header'
import { fetchWeeklyReports } from '@/lib/api'
import { CalendarRange, FileClock, Globe, Megaphone } from 'lucide-react'

export default function WeeklyReportsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['weekly-reports'],
    queryFn: fetchWeeklyReports,
  })

  const latestReport = data?.[0]
  const totalCampaigns = data?.reduce((sum, report) => sum + report.campaignCount, 0) ?? 0

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
      >
        {latestReport && (
          <div className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
            Son rapor: Hafta {latestReport.weekNumber} / {latestReport.year}
          </div>
        )}
      </PageHeader>

      <main className="space-y-6 p-6">
        {!isLoading && data && data.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InsightCard icon={FileClock} title="Toplam Rapor" value={data.length} description="Arşivlenen haftalık rapor sayısı" />
            <InsightCard icon={Megaphone} title="Toplam Kampanya" value={totalCampaigns} description="Raporların kapsadığı toplam kampanya hacmi" />
            <InsightCard icon={Globe} title="Son Site Kapsamı" value={latestReport?.siteCoverageCount ?? 0} description="En güncel raporda izlenen site sayısı" tone="info" />
            <InsightCard icon={CalendarRange} title="Son Aktif Hacim" value={latestReport?.activeOverlapCount ?? 0} description="Son raporda aktif kalan kampanyalar" tone="positive" />
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 rounded-lg border bg-card animate-pulse" />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.map((report) => (
              <WeeklyReportCard key={report.id} report={report} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FileClock}
            title="Henüz haftalık rapor bulunmuyor"
            description="Rapor üretildiğinde burada haftalık kartlar ve öne çıkan içgörüler görünecek."
          />
        )}
      </main>
    </div>
  )
}
