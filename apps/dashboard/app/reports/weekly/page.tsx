'use client'

import { useQuery } from '@tanstack/react-query'
import { WeeklyReportCard } from '@/components/reports/weekly-report-card'
import { ErrorDisplay } from '@/components/ui/error'
import { fetchWeeklyReports } from '@/lib/api'

export default function WeeklyReportsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['weekly-reports'],
    queryFn: fetchWeeklyReports,
  })

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
          <h1 className="text-lg font-semibold">Haftalık Raporlar</h1>
        </header>
        <main className="p-6">
          <ErrorDisplay error={error} onRetry={() => refetch()} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
        <h1 className="text-lg font-semibold">Haftalık Raporlar</h1>
      </header>

      <main className="p-6">
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
          <div className="text-center py-12 text-muted-foreground">
            Henüz haftalık rapor bulunmuyor
          </div>
        )}
      </main>
    </div>
  )
}
