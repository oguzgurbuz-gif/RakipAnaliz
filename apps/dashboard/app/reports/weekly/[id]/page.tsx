'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { use } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/ui/error'
import { ReportSummaryComponent } from '@/components/reports/report-summary'
import { fetchWeeklyReport, downloadWeeklyReportPdf } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { ArrowLeft, AlertTriangle, Lightbulb, BarChart3, Globe, FileText, Loader2 } from 'lucide-react'

export default function WeeklyReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const [isDownloading, setIsDownloading] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['weekly-report', resolvedParams.id],
    queryFn: () => fetchWeeklyReport(resolvedParams.id),
  })

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true)
      const blob = await downloadWeeklyReportPdf(resolvedParams.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `haftalik-rapor-${data?.year}-hafta-${data?.weekNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF download failed:', err)
    } finally {
      setIsDownloading(false)
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
          <Link href="/reports/weekly" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            <span>Geri</span>
          </Link>
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
        <Link href="/reports/weekly" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          <span>Geri</span>
        </Link>
        <h1 className="flex-1 text-lg font-semibold">Haftalık Rapor Detay</h1>
        {data && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Hazırlanıyor...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                PDF İndir
              </>
            )}
          </Button>
        )}
      </header>

      <main className="p-6 space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
            <div className="grid gap-4 md:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          </div>
        ) : data ? (
          <>
            <div>
              <h2 className="text-2xl font-bold">
                Hafta {data.weekNumber}, {data.year}
              </h2>
              <p className="text-muted-foreground mt-1">
                {formatDate(data.weekStart)} - {formatDate(data.weekEnd)}
              </p>
            </div>

            {data.executiveSummary && (
              <Card>
                <CardHeader>
                  <CardTitle>Yönetici Özeti</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{data.executiveSummary}</p>
                </CardContent>
              </Card>
            )}

            <ReportSummaryComponent data={data} showDetails />

            <div className="grid gap-6 md:grid-cols-2">
              {data.risks && data.risks.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      Riskler
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc list-inside space-y-2">
                      {data.risks.map((risk, index) => (
                        <li key={index} className="text-sm">{risk}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {data.recommendations && data.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-primary">
                      <Lightbulb className="h-5 w-5" />
                      Öneriler
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc list-inside space-y-2">
                      {data.recommendations.map((rec, index) => (
                        <li key={index} className="text-sm">{rec}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    En Çok Görülen Türler
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.topCategories.map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm">{item.category}</span>
                        <span className="text-sm font-medium">{item.count}</span>
                      </div>
                    ))}
                    {data.topCategories.length === 0 && (
                      <p className="text-sm text-muted-foreground">Veri yok</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    En Çok Kampanya Olan Siteler
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.topSites.map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm">{item.siteName}</span>
                        <span className="text-sm font-medium">{item.count}</span>
                      </div>
                    ))}
                    {data.topSites.length === 0 && (
                      <p className="text-sm text-muted-foreground">Veri yok</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
