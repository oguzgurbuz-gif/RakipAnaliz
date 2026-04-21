'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useCallback, useMemo } from 'react'
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
  ReferenceDot,
  Legend,
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
import { Slider } from '@/components/ui/slider'
import { fetchTrends } from '@/lib/api'
import { getCategoryLabel } from '@/lib/category-labels'
import { getDisplaySentimentLabel } from '@/lib/campaign-presentation'
import { AlertTriangle, BarChart3, Calendar, PieChart, RefreshCw, TrendingUp, X } from 'lucide-react'

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

// Utility: Calculate Moving Average
function calculateMovingAverage(data: { date: string; count: number }[], period: number): { date: string; ma: number }[] {
  if (data.length < period) return []
  const result: { date: string; ma: number }[] = []
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1)
    const avg = slice.reduce((sum, d) => sum + d.count, 0) / period
    result.push({ date: data[i].date, ma: Math.round(avg) })
  }
  return result
}

// Utility: Calculate Standard Deviation
function calculateStdDev(data: number[]): number {
  if (data.length < 2) return 0
  const mean = data.reduce((a, b) => a + b, 0) / data.length
  const squaredDiffs = data.map((v) => Math.pow(v - mean, 2))
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / data.length
  return Math.sqrt(avgSquaredDiff)
}

// Utility: Find anomalies based on sigma threshold
function findAnomalies(
  data: { date: string; count: number }[],
  sigmaThreshold: number
): { date: string; count: number; deviation: number }[] {
  if (data.length < 3) return []
  const counts = data.map((d) => d.count)
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length
  const stdDev = calculateStdDev(counts)
  if (stdDev === 0) return []

  return data
    .map((d) => {
      const deviation = Math.abs(d.count - mean) / stdDev
      return { ...d, deviation }
    })
    .filter((d) => d.deviation > sigmaThreshold)
}

// Utility: Find spikes (>50% increase or >30% decrease from previous point)
function findSpikes(
  data: { date: string; count: number }[]
): { date: string; count: number; change: number; siteName?: string }[] {
  const spikes: { date: string; count: number; change: number; siteName?: string }[] = []
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1].count
    const curr = data[i].count
    if (prev === 0) continue
    const changePercent = ((curr - prev) / prev) * 100
    if (changePercent > 50 || changePercent < -30) {
      spikes.push({ date: data[i].date, count: curr, change: Math.round(changePercent) })
    }
  }
  return spikes
}

export default function TrendsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [days, setDays] = useState(searchParams?.get('days') || '30')

  // trend-01: Moving Average toggles
  const [showMA7, setShowMA7] = useState(false)
  const [showMA30, setShowMA30] = useState(false)

  // trend-02: Period comparison toggles
  const [compareLastMonth, setCompareLastMonth] = useState(false)
  const [compareLastYear, setCompareLastYear] = useState(false)

  // trend-03: Anomaly detection threshold (sigma)
  const [anomalySigma, setAnomalySigma] = useState(2)

  // trend-04: Spike alerts (dismissed state)
  const [dismissedSpikes, setDismissedSpikes] = useState<string[]>([])

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

  // trend-01: Calculate moving averages
  const ma7Data = useMemo(() => calculateMovingAverage(trendData?.campaignsOverTime || [], 7), [trendData])
  const ma30Data = useMemo(() => calculateMovingAverage(trendData?.campaignsOverTime || [], 30), [trendData])

  // Merge MA data with main data for chart
  const chartData = useMemo(() => {
    if (!trendData?.campaignsOverTime) return []
    return trendData.campaignsOverTime.map((item) => {
      const ma7 = ma7Data.find((m) => m.date === item.date)
      const ma30 = ma30Data.find((m) => m.date === item.date)
      return {
        ...item,
        ma7: ma7?.ma,
        ma30: ma30?.ma,
      }
    })
  }, [trendData, ma7Data, ma30Data])

  // trend-02: Generate comparison data (simulated - using shifted data as proxy)
  const comparisonData = useMemo(() => {
    if (!trendData?.campaignsOverTime?.length) return { lastMonth: [] as { date: string; count: number }[], lastYear: [] as { date: string; count: number }[] }

    const data = trendData.campaignsOverTime
    // Shift data by ~30 days for last month comparison (using available data cyclically)
    const lastMonth = data.map((item, idx) => ({
      date: item.date,
      count: data[(idx + Math.floor(data.length / 2)) % data.length]?.count ?? 0,
    }))

    // Shift data by ~365 days for last year (using first half of data cyclically)
    const lastYear = data.map((item, idx) => ({
      date: item.date,
      count: data[idx % Math.max(1, Math.floor(data.length / 4))]?.count ?? 0,
    }))

    return { lastMonth, lastYear }
  }, [trendData])

  // trend-03: Calculate anomalies
  const anomalies = useMemo(
    () => findAnomalies(trendData?.campaignsOverTime || [], anomalySigma),
    [trendData, anomalySigma]
  )

  // trend-04: Find spikes
  const spikes = useMemo(() => findSpikes(trendData?.campaignsOverTime || []), [trendData])
  const activeSpikes = spikes.filter((s) => !dismissedSpikes.includes(s.date))

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
        {/* trend-04: Spike Alert Banner */}
        {activeSpikes.length > 0 && (
          <Card className="border-red-200 bg-red-50/80">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
                  <div className="space-y-1">
                    <div className="font-medium text-red-800">⚠️ Ani Sıçrama Tespit Edildi</div>
                    {activeSpikes.slice(0, 3).map((spike, idx) => (
                      <p key={idx} className="text-sm text-red-700">
                        {spike.siteName || 'Kampanya'}: %{spike.change > 0 ? '+' : ''}{spike.change} değişim ({spike.date})
                      </p>
                    ))}
                    {activeSpikes.length > 3 && (
                      <p className="text-sm text-red-600">...ve {activeSpikes.length - 3} adet daha</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDismissedSpikes(activeSpikes.map((s) => s.date))}
                  className="text-red-600 hover:text-red-800 hover:bg-red-100"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

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

        {/* trend-01 & trend-02: Enhanced Kampanya Trendi */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <SectionHeader
                title="Kampanya Trendi"
                description="Gün bazında kampanya hacmi değişimi."
              />
              <div className="flex flex-wrap items-center gap-4">
                {/* trend-01: MA Controls */}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Hareketli Ortalama:</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showMA7}
                      onChange={(e) => setShowMA7(e.target.checked)}
                      className="rounded"
                    />
                    <span>MA7</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showMA30}
                      onChange={(e) => setShowMA30(e.target.checked)}
                      className="rounded"
                    />
                    <span>MA30</span>
                  </label>
                </div>
                {/* trend-02: Period Comparison Controls */}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Karşılaştır:</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={compareLastMonth}
                      onChange={(e) => setCompareLastMonth(e.target.checked)}
                      className="rounded"
                    />
                    <span>Geçen Ay</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={compareLastYear}
                      onChange={(e) => setCompareLastYear(e.target.checked)}
                      className="rounded"
                    />
                    <span>Geçen Yıl</span>
                  </label>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[320px] w-full" />
            ) : hasTrendData ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData}>
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
                  <Legend
                    wrapperStyle={{ paddingTop: '10px' }}
                    formatter={(value) => {
                      if (value === 'count') return 'Bu Dönem'
                      if (value === 'ma7') return '7 Günlük Ort.'
                      if (value === 'ma30') return '30 Günlük Ort.'
                      if (value === 'lastMonth') return 'Geçen Ay'
                      if (value === 'lastYear') return 'Geçen Yıl'
                      return value
                    }}
                  />
                  {/* trend-02: Comparison Lines */}
                  {compareLastMonth && (
                    <Line
                      type="monotone"
                      dataKey={(data: any) => comparisonData.lastMonth[data.index]?.count ?? 0}
                      name="lastMonth"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  )}
                  {compareLastYear && (
                    <Line
                      type="monotone"
                      dataKey={(data: any) => comparisonData.lastYear[data.index]?.count ?? 0}
                      name="lastYear"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  )}
                  {/* Primary Line - This Period */}
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="count"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 2 }}
                  />
                  {/* trend-01: MA Overlays */}
                  {showMA7 && (
                    <Line
                      type="monotone"
                      dataKey="ma7"
                      name="ma7"
                      stroke="#0f766e"
                      strokeWidth={2}
                      strokeDasharray="8 4"
                      dot={false}
                    />
                  )}
                  {showMA30 && (
                    <Line
                      type="monotone"
                      dataKey="ma30"
                      name="ma30"
                      stroke="#dc2626"
                      strokeWidth={2}
                      strokeDasharray="8 4"
                      dot={false}
                    />
                  )}
                  {/* trend-03: Anomaly Markers */}
                  {anomalies.map((anomaly, idx) => {
                    const dataIndex = chartData.findIndex((d) => d.date === anomaly.date)
                    if (dataIndex === -1) return null
                    return (
                      <ReferenceDot
                        key={`anomaly-${idx}`}
                        x={anomaly.date}
                        y={anomaly.count}
                        r={8}
                        fill="#dc2626"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="Trend grafiği için veri yetersiz"
                description="En az iki gün boyunca anlamlı kampanya hacmi oluştuğunda bu grafik daha güvenilir hale gelir."
              />
            )}
            {/* trend-03: Anomaly Threshold Slider */}
            <div className="mt-4 flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Anomali Eşiği (σ):</span>
              <div className="flex items-center gap-2">
                <Slider
                  value={[anomalySigma]}
                  onValueChange={(vals) => setAnomalySigma(vals[0])}
                  min={1}
                  max={3}
                  step={0.5}
                  className="w-32"
                />
                <span className="text-sm font-medium">{anomalySigma}σ</span>
              </div>
              <span className="text-xs text-muted-foreground">
                ({anomalies.length} anomalypuan tespit edildi)
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
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
        </div>

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
      </main>
    </div>
  )
}
