'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { use } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/ui/error'
import { EmptyState } from '@/components/ui/empty-state'
import { InsightCard } from '@/components/ui/insight-card'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { ReportSummaryComponent } from '@/components/reports/report-summary'
import { fetchWeeklyReport, downloadWeeklyReportPdf } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { getCategoryLabel } from '@/lib/category-labels'
import { ArrowLeft, AlertTriangle, Lightbulb, BarChart3, Globe, FileText, Loader2, Sparkles, ShieldAlert } from 'lucide-react'

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
        <PageHeader
          title="Haftalık Rapor Detay"
          description="Seçilen haftanın özetini, risklerini ve site dağılımını inceleyin."
          actions={
            <Link href="/reports/weekly" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              <span>Haftalık raporlara dön</span>
            </Link>
          }
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
        title={data ? `Hafta ${data.weekNumber}, ${data.year}` : 'Haftalık Rapor Detay'}
        description={data ? `${formatDate(data.weekStart)} - ${formatDate(data.weekEnd)} aralığındaki kampanya görünürlüğü ve haftalık karar özeti.` : 'Haftalık rapor detayları yükleniyor.'}
        actions={
          <>
            <Link href="/reports/weekly" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              <span>Geri</span>
            </Link>
            {data && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Hazırlanıyor...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    PDF İndir
                  </>
                )}
              </Button>
            )}
          </>
        }
      />

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
            <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
              <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-card via-card to-sky-50/40">
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      Executive Brief
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {data.executiveSummary || `${data.campaignCount} kampanyalık haftalık görünüm hazırlandı.`}
                    </h2>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      {data.startedCount} yeni başlangıç, {data.endedCount} bitiş ve {data.changedCount} güncelleme ile haftanın ritmi özetlendi.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <InsightCard
                icon={ShieldAlert}
                title="En Aksiyonlu Alan"
                value={data.topSites[0]?.siteName || 'Belirsiz'}
                description={data.topSites[0] ? `${data.topSites[0].count} kampanya ile haftanın en görünür sitesi` : 'Site kırılımı verisi sınırlı'}
                tone="warning"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InsightCard icon={BarChart3} title="Toplam Kampanya" value={data.campaignCount} description="Haftalık rapor kapsamındaki görünür kampanyalar" />
              <InsightCard icon={Globe} title="Site Kapsamı" value={data.siteCoverageCount} description="Raporun kapsadığı aktif site sayısı" tone="info" />
              <InsightCard icon={Sparkles} title="Yeni Başlangıç" value={data.startedCount} description="Bu hafta ilk kez görülen kampanyalar" tone="positive" />
              <InsightCard icon={AlertTriangle} title="Biten Kampanya" value={data.endedCount} description="Hafta içinde kapanan kampanyalar" />
            </div>

            {data.executiveSummary && (
              <Card>
                <CardHeader>
                  <SectionHeader
                    title="Yönetici Özeti"
                    description="Haftanın en önemli değişimlerini üst seviyede özetler."
                  />
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
                    <SectionHeader
                      title="Riskler"
                      description="Takip gerektiren olumsuz veya zayıf sinyaller."
                    />
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {data.risks.map((risk, index) => (
                        <li key={index} className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">{risk}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {data.recommendations && data.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <SectionHeader
                      title="Öneriler"
                      description="Bu haftanın verisine göre aksiyon alınabilecek kısa öneriler."
                    />
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {data.recommendations.map((rec, index) => (
                        <li key={index} className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="mt-0.5 h-4 w-4 text-primary" />
                            <span>{rec}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <SectionHeader
                    title="Kategori Dağılımı"
                    description="Bu hafta en görünür kampanya tipleri."
                  />
                </CardHeader>
                <CardContent>
                  {data.topCategories.length > 0 ? (
                    <div className="space-y-3">
                      {data.topCategories.map((item, index) => (
                        <div key={index} className="rounded-xl border border-border/70 p-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{getCategoryLabel(item.category)}</span>
                            <span className="text-muted-foreground">{item.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={BarChart3}
                      title="Kategori özeti bulunamadı"
                      description="Bu haftalık rapor için kategori kırılımı üretilmemiş."
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <SectionHeader
                    title="Site Kırılımı"
                    description="Haftalık görünürlükte en yoğun siteler."
                  />
                </CardHeader>
                <CardContent>
                  {data.topSites.length > 0 ? (
                    <div className="space-y-3">
                      {data.topSites.map((item, index) => (
                        <div key={index} className="rounded-xl border border-border/70 p-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{item.siteName}</span>
                            <span className="text-muted-foreground">{item.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Globe}
                      title="Site kırılımı bulunamadı"
                      description="Bu haftalık rapor için site bazlı dağılım verisi üretilmemiş."
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
