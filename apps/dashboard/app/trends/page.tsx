'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPie,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDisplay } from '@/components/ui/error'
import { Input } from '@/components/ui/input'
import { InsightCard } from '@/components/ui/insight-card'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchTrends } from '@/lib/api'
import { getCategoryLabel } from '@/lib/category-labels'
import { getDisplaySentimentLabel } from '@/lib/campaign-presentation'
import { AlertTriangle, BarChart3, Calendar, PieChart, RefreshCw, TrendingUp } from 'lucide-react'

const COLORS = ['#0f766e', '#2563eb', '#f59e0b', '#dc2626', '#8b5cf6', '#0891b2', '#84cc16', '#64748b']

interface TrendData {
  campaignsOverTime: { date: string; count: number }[]
  categoryByDate: Record<string, Record<string, number>>
  categoryDistribution: { category: string; count: number }[]
  sentimentDistribution: { sentiment: string; count: number }[]
  topSites: { siteName: string; campaignCount: number }[]
  valueScoresBySite: { siteName: string; avgValueScore: number }[]
  topCategoriesThisWeek: { category: string; count: number }[]
}

export default function TrendsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [days, setDays] = useState(searchParams?.get('days') || '30')

  const updateUrl = useCallback((updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '' || value === '30') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }
    router.replace(`${pathname}?${params.toString()}`)
  }, [searchParams, router, pathname])

  const handleDaysChange = (newDays: string) => {
    setDays(newDays)
    updateUrl({ days: newDays })
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['trends', days],
    queryFn: () => fetchTrends(parseInt(days, 10)),
  })

  const trendData = data as TrendData | undefined
  const totalCampaigns = trendData?.campaignsOverTime?.reduce((acc, curr) => acc + curr.count, 0) ?? 0
  const averagePerDay = trendData?.campaignsOverTime?.length
    ? Math.round(totalCampaigns / trendData.campaignsOverTime.length)
    : 0

  const normalizedCategoryDistribution =
    trendData?.categoryDistribution.map((item) => ({
      ...item,
      label: getCategoryLabel(item.category),
    })) ?? []

  const normalizedSentimentDistribution =
    trendData?.sentimentDistribution.map((item) => ({
      ...item,
      label: getDisplaySentimentLabel(item.sentiment),
    })) ?? []

  const meaningfulSentimentCount = normalizedSentimentDistribution
    .filter((item) => item.label !== 'Bilinmiyor')
    .reduce((sum, item) => sum + item.count, 0)

  const hasTrendData = (trendData?.campaignsOverTime?.length ?? 0) >= 2 && totalCampaigns > 0
  const hasCategoryData = normalizedCategoryDistribution.length > 0
  const hasSentimentData = normalizedSentimentDistribution.length > 0 && meaningfulSentimentCount > 0
  const topCategory = normalizedCategoryDistribution[0]
  const topSite = trendData?.topSites?.[0]
  const dataWarnings = [
    !hasTrendData ? 'Zaman serisi zayıf; kampanya trendi güvenle yorumlanamayacak kadar az veri içeriyor.' : null,
    !hasSentimentData ? 'Duygu verisi çoğunlukla bilinmiyor; bu grafik kesin yargı için uygun değil.' : null,
    !hasCategoryData ? 'Kategori kırılımı henüz yeterli derinlikte oluşmadı.' : null,
  ].filter(Boolean) as string[]

  if (error) {
    return <ErrorDisplay error={error} onRetry={() => refetch()} />
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Trend Analizi"
        description="Kampanya hacmini, kategori yoğunluğunu ve duygu dağılımını zaman içinde izleyin; veri zayıf olduğunda bunu açıkça görün."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Yenile
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <label className="font-medium">Son gün</label>
          <Input
            type="number"
            min="7"
            max="90"
            value={days}
            onChange={(e) => handleDaysChange(e.target.value)}
            className="w-20 bg-background"
          />
        </div>
      </PageHeader>

      <main className="space-y-6 p-6">
        {!isLoading && dataWarnings.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/80">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                <div className="space-y-2">
                  <div className="font-medium">Veri Dürüstlüğü Notu</div>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {dataWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InsightCard icon={TrendingUp} title="Toplam Kampanya" value={totalCampaigns} description={`${days} günlük pencere içindeki görünür hacim`} />
          <InsightCard icon={Calendar} title="Günlük Ortalama" value={averagePerDay} description="Seçilen dönemde gün başına ortalama kampanya" tone="info" />
          <InsightCard
            icon={BarChart3}
            title="Baskın Kategori"
            value={topCategory?.label || '-'}
            description={topCategory ? `${topCategory.count} kayıt ile öne çıkıyor` : 'Yeterli kategori verisi yok'}
            tone="positive"
          />
          <InsightCard
            icon={PieChart}
            title="En Aktif Site"
            value={topSite?.siteName || '-'}
            description={topSite ? `${topSite.campaignCount} kampanya ile önde` : 'Site verisi sınırlı'}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <SectionHeader
                title="Kampanya Trendi"
                description="Gün bazında kampanya hacmi değişimi."
              />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[320px] w-full" />
              ) : hasTrendData ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={trendData?.campaignsOverTime || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => {
                        const date = new Date(value)
                        return `${date.getMonth() + 1}/${date.getDate()}`
                      }}
                    />
                    <YAxis />
                    <Tooltip labelFormatter={(value) => new Date(value).toLocaleDateString('tr-TR')} />
                    <Line type="monotone" dataKey="count" name="Kampanya" stroke="#2563eb" strokeWidth={3} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="Trend grafiği için veri yetersiz"
                  description="En az iki gün boyunca anlamlı kampanya hacmi oluştuğunda bu grafik daha güvenilir hale gelir."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionHeader
                title="Duygu Dağılımı"
                description="AI etiketleri normalize edilerek sunulur."
              />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[320px] w-full" />
              ) : hasSentimentData ? (
                <ResponsiveContainer width="100%" height={320}>
                  <RechartsPie>
                    <Pie
                      data={normalizedSentimentDistribution.filter((item) => item.count > 0)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ payload, percent }: { payload?: { label?: string }; percent?: number }) =>
                        `${payload?.label ?? ''}: ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      outerRadius={102}
                      fill="#2563eb"
                      dataKey="count"
                      nameKey="label"
                    >
                      {normalizedSentimentDistribution.map((entry, index) => (
                        <Cell key={`${entry.sentiment}-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, _name, payload) => [
                        Number(value ?? 0),
                        (payload?.payload as { label?: string } | undefined)?.label || 'Duygu',
                      ]}
                    />
                  </RechartsPie>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={PieChart}
                  title="Duygu grafiği güvenilir değil"
                  description="Mevcut veri çoğunlukla 'Bilinmiyor' etiketine düştüğü için duygu dağılımı yorumlanabilir seviyede değil."
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <SectionHeader
                title="Kategori Dağılımı"
                description="En görünür kampanya tipleri normalize edilmiş etiketlerle gösterilir."
              />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[320px] w-full" />
              ) : hasCategoryData ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={normalizedCategoryDistribution.slice(0, 8)} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis
                      dataKey="label"
                      type="category"
                      width={150}
                      tickFormatter={(value) => value.length > 22 ? `${value.slice(0, 22)}...` : value}
                    />
                    <Tooltip formatter={(value) => [Number(value ?? 0), 'Kampanya']} />
                    <Bar dataKey="count" name="Kampanya Sayısı" fill="#0f766e" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={BarChart3}
                  title="Kategori grafiği oluşturulamadı"
                  description="Kategori çıkarımı henüz yeterli kapsama ulaşmadı."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionHeader
                title="Bu Haftanın Öne Çıkanları"
                description="Kategori ve site yoğunluğuna göre kısa özet."
              />
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <div className="text-sm font-medium">En Güçlü Kategoriler</div>
                {trendData?.topCategoriesThisWeek?.length ? (
                  trendData.topCategoriesThisWeek.slice(0, 5).map((item, index) => (
                    <div key={`${item.category}-${index}`} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-sm">
                      <span>{getCategoryLabel(item.category)}</span>
                      <span className="text-muted-foreground">{item.count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Bu hafta için kategori özeti yok.</p>
                )}
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">En Aktif Siteler</div>
                {trendData?.topSites?.length ? (
                  trendData.topSites.slice(0, 5).map((item, index) => (
                    <div key={`${item.siteName}-${index}`} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-sm">
                      <span>{item.siteName}</span>
                      <span className="text-muted-foreground">{item.campaignCount}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Site yoğunluğu verisi bulunamadı.</p>
                )}
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">Değer Skoru</div>
                {trendData?.valueScoresBySite?.length ? (
                  trendData.valueScoresBySite.slice(0, 5).map((item, index) => (
                    <div key={`${item.siteName}-score-${index}`} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-sm">
                      <span>{item.siteName}</span>
                      <span className="text-muted-foreground">{item.avgValueScore.toFixed(1)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Değer skoru için yeterli AI verisi yok.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
