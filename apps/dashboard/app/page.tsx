'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/ui/error'
import { InsightCard } from '@/components/ui/insight-card'
import { PageHeader } from '@/components/ui/page-header'
import { fetchReportSummary, fetchCompetition } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getCategoryLabel } from '@/lib/category-labels'
import { useSSE } from '@/hooks/useSSE'
import { Crown, Target, TrendingUp, Sparkles, BarChart3, ArrowUpRight, ArrowDownRight, Activity, Users, Clock, CalendarRange } from 'lucide-react'
import Link from 'next/link'
import { cn, formatDateRange } from '@/lib/utils'
import { AlertBanner } from '@/components/ui/alert-banner'
import { DateRangePickerHeader } from '@/components/ui/date-range-picker-header'
import { useDateRange } from '@/lib/date-range/context'
import { WeeklyBriefCard } from '@/components/dashboard/weekly-brief-card'
import { WinLossTracker } from '@/components/insights/win-loss-tracker'

const HOME_SCOPE = 'home'

// FE-9: Progress Bar Component with percentage explanations
function ProgressBar({ value, max, label, color, explanation }: { value: number; max?: number; label: string; color?: 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'violet' | 'orange' | 'emerald'; explanation?: string }) {
  const maxVal = max || 1
  const percentage = Math.min(100, Math.round((value / maxVal) * 100))
  const autoColor = percentage > 90 ? 'red' : percentage > 70 ? 'yellow' : 'green'
  const barColor = color || autoColor
  
  const colorMap = {
    green: 'bg-emerald-500',
    emerald: 'bg-emerald-500',
    yellow: 'bg-amber-500', 
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    purple: 'bg-violet-500',
    violet: 'bg-violet-500',
    orange: 'bg-orange-500',
  }

  // FE-9: Build tooltip text with explanation
  const tooltipText = explanation || `${label}: ${percentage}%`

  return (
    <div className="space-y-1.5" title={tooltipText}>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{percentage}%</span>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div 
          className={cn('h-full rounded-full transition-all duration-700 ease-out', colorMap[barColor])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

// Large Stat Card with gradient
function HeroStatCard({ 
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  color,
  tooltip,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  color: 'green' | 'blue' | 'purple' | 'orange' | 'emerald'
  /** Native hover tooltip — metriğin ne ölçtüğünü, nasıl hesaplandığını açıklar. */
  tooltip?: string
}) {
  const colorConfig = {
    green: { bg: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-500', text: 'text-emerald-600' },
    blue: { bg: 'bg-blue-50 border-blue-200', icon: 'bg-blue-500', text: 'text-blue-600' },
    purple: { bg: 'bg-violet-50 border-violet-200', icon: 'bg-violet-500', text: 'text-violet-600' },
    orange: { bg: 'bg-orange-50 border-orange-200', icon: 'bg-orange-500', text: 'text-orange-600' },
    emerald: { bg: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-500', text: 'text-emerald-600' },
  }
  
  const config = colorConfig[color]

  return (
    <Card
      className={cn('border-2 transition-all hover:shadow-md', config.bg)}
      title={tooltip}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {title}
              {tooltip && <span className="ml-1 text-muted-foreground/70" aria-hidden>ⓘ</span>}
            </p>
            <p className="text-5xl font-bold tracking-tight">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {trend && trendValue && (
              <div className={cn('flex items-center gap-1 text-xs font-semibold', trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500')}>
                {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : trend === 'down' ? <ArrowDownRight className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                {trendValue}
              </div>
            )}
          </div>
          <div className={cn('p-3 rounded-xl shadow-sm', config.icon)}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Wave 1 #1.1 — "Aktiflik %" ve "CTR %" hardcoded değerleri kaldırıldı (gerçek
 * karşılığı yok). Geriye iki gerçek metrik kaldı:
 *   - Rakip Sayısı   = sites WHERE is_active = TRUE COUNT
 *   - Son Güncelleme = MAX(campaigns.last_seen_at) → "Xd / Xs / Xdk önce"
 */
function formatRelativeTimeFromNow(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return '—'
  const diffMs = Date.now() - ts
  if (diffMs < 0) return 'şimdi'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'şimdi'
  if (minutes < 60) return `${minutes}dk önce`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}sa önce`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}g önce`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}ay önce`
  const years = Math.floor(days / 365)
  return `${years}y önce`
}

function QuickStatsRow({
  activeCompetitors,
  lastUpdatedAt,
}: {
  activeCompetitors: number
  lastUpdatedAt: string | null
}) {
  const lastUpdatedLabel = formatRelativeTimeFromNow(lastUpdatedAt)
  const lastUpdatedTooltip = lastUpdatedAt
    ? `Son scrape kayıtlanan campaign.last_seen_at: ${new Date(lastUpdatedAt).toLocaleString('tr-TR')}`
    : 'Henüz scrape kaydı yok'
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-violet-50 to-violet-100 border border-violet-200 shadow-sm">
        <div className="p-2 rounded-lg bg-violet-500 text-white shadow-sm">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-violet-600 font-medium">Rakip Sayısı</p>
          <p className="text-2xl font-bold text-violet-700">{activeCompetitors}</p>
        </div>
      </div>
      <div
        className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 shadow-sm"
        title={lastUpdatedTooltip}
      >
        <div className="p-2 rounded-lg bg-orange-500 text-white shadow-sm">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-orange-600 font-medium">Son Güncelleme</p>
          <p className="text-2xl font-bold text-orange-700">{lastUpdatedLabel}</p>
        </div>
      </div>
    </div>
  )
}

// FE-8/FE-15: Comparison Bar Component with currency formatting and clickable functionality
function ComparisonBar({ 
  label, 
  value, 
  maxValue, 
  isPrimary = false,
  color = 'primary',
  siteCode,
  onClick
}: { 
  label: string
  value: number
  maxValue?: number
  isPrimary?: boolean
  color?: string
  siteCode?: string
  onClick?: () => void
}) {
  const maxVal = maxValue || 1
  const width = maxVal > 0 ? (value / maxVal) * 100 : 0

  // FE-8: Format currency values with ₺ symbol and thousand separators
  const formatValue = (val: number): string => {
    if (val >= 1000) {
      return `₺${Math.round(val).toLocaleString('tr-TR')}`
    }
    return String(val)
  }

  return (
    <div 
      className={cn('flex items-center gap-3', onClick && 'cursor-pointer hover:bg-muted/30 rounded p-1 -mx-1 transition-colors')}
      onClick={onClick}
      title={siteCode ? `${label} - Detaylar için tıklayın` : undefined}
    >
      <span className={cn('w-20 text-sm', isPrimary ? 'font-bold' : 'text-muted-foreground truncate')} title={label}>
        {label}
      </span>
      <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
        <div 
          className={cn(
            'h-full rounded-full transition-all duration-700',
            isPrimary ? (color === 'green' ? 'bg-emerald-500' : 'bg-primary') : 'bg-muted-foreground/30'
          )}
          style={{ width: `${Math.min(100, width)}%` }}
        />
      </div>
      <span className={cn('w-16 text-right text-sm font-semibold', isPrimary && 'font-bold')}>
        {formatValue(value)}
      </span>
    </div>
  )
}

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()

  const getParam = (key: string, defaultValue: string = ''): string => {
    if (!searchParams) return defaultValue
    return searchParams.get(key) || defaultValue
  }

  // Global tarih aralığı — `home` scope'u, default 'thisWeek'.
  // Cookie + URL ile persist; AI Karşılaştırma Paneli ve Hero stat'lar bu aralığa
  // bağlı yenilenir.
  const { from: dateFrom, to: dateTo } = useDateRange(HOME_SCOPE)
  const [selectedCategory, setSelectedCategory] = useState(getParam('selectedCategory'))

  useSSE(useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['report-summary'] })
    queryClient.invalidateQueries({ queryKey: ['competition'] })
  }, [queryClient]))

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

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value)
    updateUrl({ selectedCategory: value || undefined })
  }

  // FE-11: Add benchmark note to hero stats - explain what "94%" means
  // (moved after competitionData is available)

  // FE-15: Handle clicking on a competitor bar to filter campaigns by that site
  const handleCompetitorClick = (siteCode: string, siteName: string) => {
    // Navigate to campaigns page with that site filter
    router.push(`/campaigns?siteId=${encodeURIComponent(siteCode)}`)
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-summary', dateFrom, dateTo],
    queryFn: () => fetchReportSummary(dateFrom || undefined, dateTo || undefined),
    // Tarih aralığı henüz hidrate olmadıysa boş string gelebilir; çağrı yapma.
    enabled: Boolean(dateFrom && dateTo),
  })

  const { data: competitionData, isLoading: competitionLoading } = useQuery({
    queryKey: ['competition', selectedCategory, dateFrom, dateTo],
    queryFn: () =>
      fetchCompetition(selectedCategory || undefined, { from: dateFrom, to: dateTo }),
    enabled: Boolean(dateFrom && dateTo),
  })

  const handleRefresh = () => {
    refetch()
  }

  // Competition analysis
  const bitalihData = competitionData?.siteRankings?.find(s => s.site_code === 'bitalih')
  const otherSites = competitionData?.siteRankings?.filter(s => s.site_code !== 'bitalih') || []
  const avgCompetitorCampaigns = otherSites.length > 0
    ? otherSites.reduce((sum, s) => sum + Number(s.total_campaigns), 0) / otherSites.length
    : 0
  const bestCompetitor = otherSites.length > 0
    ? otherSites.reduce((best, s) => (Number(s.avg_bonus || 0) > Number(best?.avg_bonus || 0) ? s : best), otherSites[0])
    : null

  // Determine Bitalih position
  const bitalihCampaignsBetter = (bitalihData?.total_campaigns ?? 0) >= avgCompetitorCampaigns
  const bitalihBonusBetter = (bitalihData?.avg_bonus ?? 0) >= (bestCompetitor?.avg_bonus ?? 0)

  // FE-11: Add benchmark note to hero stats - explain what "94%" means
  const activeRate = Number(bitalihData?.active_rate || 0) * 100
  const benchmarkNote = activeRate > 85
    ? ' (Sektör ortalamasının üzerinde - iyi performans)'
    : activeRate > 70
    ? ' (Sektör ortalaması - geliştirilebilir)'
    : ' (Sektör ortalamasının altında - iyileştirme gerekli)'

  // Sample size guard: AI Karşılaştırma Paneli'ndeki ranking + bonus
  // metrikleri 10'dan az kampanyada çok gürültülü olur (tek kampanya bir
  // siteyi yapay olarak lider yapabilir). Toplam aktif rakip kampanya
  // sayısına bakıyoruz — bitalih hariç, çünkü burada ölçtüğümüz şey
  // "rakipleri karşılaştırmak için yeterli veri var mı".
  const totalCompetitorCampaigns = otherSites.reduce(
    (sum, s) => sum + Number(s.total_campaigns || 0),
    0
  )
  const sampleSizeWarning: { variant: 'warning' | 'error'; title: string; message: string } | null =
    competitionLoading || !competitionData
      ? null
      : totalCompetitorCampaigns === 0
      ? {
          variant: 'error',
          title: 'Bu dönemde rakip kampanya verisi yok',
          message:
            'Seçili tarih aralığında hiç rakip kampanya bulunamadı. Aralığı genişlet ya da scraper son çalışmasını kontrol et.',
        }
      : totalCompetitorCampaigns < 10
      ? {
          variant: 'error',
          title: `Sadece ${totalCompetitorCampaigns} kampanya tespit edildi`,
          message:
            'Veri yetersiz — sıralamalar ve bonus karşılaştırmaları yanıltıcı olabilir. Tarih aralığını genişletmeyi düşün.',
        }
      : totalCompetitorCampaigns < 50
      ? {
          variant: 'warning',
          title: `${totalCompetitorCampaigns} kampanya — örneklem küçük`,
          message:
            'Trendleri dikkatli yorumla. Tek bir büyük kampanya site sıralamasını kaydırabilir.',
        }
      : null

  // Calculate max values for comparison bars
  const maxCampaigns = Math.max(
    Number(bitalihData?.total_campaigns || 0),
    ...otherSites.map(s => Number(s.total_campaigns))
  )
  const maxBonus = Math.max(
    Number(bitalihData?.avg_bonus || 0),
    ...otherSites.map(s => Number(s.avg_bonus))
  )

  if (error) {
    return <ErrorDisplay error={error} onRetry={handleRefresh} />
  }

  return (
    <div className="min-h-screen bg-background">
      {/* System Alert Banners */}
      <AlertBanner
        id="demo-system"
        variant="info"
        title="Demo Modu Aktif"
        message="Bu bir demo sistemdir. Veriler gerçek zamanlı olarak güncellenmektedir."
      />
      <AlertBanner
        id="update-rate"
        variant="warning"
        title="Veri Güncelleme Sıklığı"
        message="Sistem verileri her 5 dakikada bir otomatik olarak güncellenmektedir."
        dismissable={true}
      />

      <PageHeader
        title="Dashboard"
        description="Rakiplerle karşılaştırmalı kampanya analizi"
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              Yenile
            </Button>
          </div>
        }
      />

      <main className="p-6 space-y-6">
        {/* Hafta Özeti Brief — DeepSeek prescriptive AI; QuickStats'tan ÖNCE */}
        <WeeklyBriefCard />

        {/* Win/Loss Tracker — ranking_snapshots (migration 021). Bitalih'in
            haftalık sıralama değişimi: 4 metric pozisyonu + geçtikleri/geçenler. */}
        <WinLossTracker />

        {/* Global tarih aralığı header'ı — `home` scope, default 'Bu Hafta' */}
        <DateRangePickerHeader scope={HOME_SCOPE} />

        {/* HERO STATS - Large Numbers with Color Coding + Period Deltas */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <HeroStatCard
            title="Toplam Kampanya"
            value={data?.startedCount ?? 0}
            subtitle={`Bu dönem başlatıldı`}
            icon={Target}
            trend={data?.deltas?.started?.direction}
            trendValue={data?.deltas ? `${data.deltas.started.diff >= 0 ? '+' : ''}${data.deltas.started.diff} (${data.deltas.started.diff >= 0 ? '+' : ''}${data.deltas.started.pct}%)` : undefined}
            color="emerald"
            tooltip="Seçili dönem içinde ilk kez gözlemlenen (started) kampanya sayısı. Trend: önceki aynı uzunluktaki dönemle fark."
          />
          <HeroStatCard
            title="Aktif Kampanya"
            value={data?.activeCount ?? 0}
            subtitle={`Toplam ${bitalihData?.total_campaigns ?? 0} kampanya`}
            icon={Activity}
            trend={data?.deltas?.active?.direction}
            trendValue={data?.deltas ? `${data.deltas.active.diff >= 0 ? '+' : ''}${data.deltas.active.diff} (${data.deltas.active.diff >= 0 ? '+' : ''}${data.deltas.active.pct}%)` : undefined}
            color="blue"
            tooltip="Şu an aktif olarak çalıştığı gözlemlenen kampanya sayısı (son scrape'te görülmüş ve valid_to geçmemiş)."
          />
          <HeroStatCard
            title="Takip Edilen Rakip"
            value={otherSites.length + 1}
            subtitle="Aktif olarak izleniyor"
            icon={Users}
            color="purple"
            tooltip="Aktif (is_active=true) olarak izlenen site sayısı — bitalih dahil. Yeni rakip eklemek için admin/sites sayfasına git."
          />
          <HeroStatCard
            title="En Yüksek Bonus"
            value={`₺${Math.round(Number(bestCompetitor?.avg_bonus || 0))}`}
            subtitle={bestCompetitor?.site_name || 'Bitalih'}
            icon={Crown}
            color="orange"
            tooltip="Seçili dönemde en yüksek ortalama efektif bonus tutarını sunan rakip sitenin değeri."
          />
        </div>

        {/* Period Comparison Info */}
        {data?.prevPeriodFrom && data?.prevPeriodTo && (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 flex items-center gap-2">
            <TrendingUp className="w-3 h-3" />
            <span>
              Karşılaştırma: <span className="font-medium">{new Date(data.prevPeriodFrom).toLocaleDateString('tr-TR')}</span> – <span className="font-medium">{new Date(data.prevPeriodTo).toLocaleDateString('tr-TR')}</span>
              {' '}|{' '}
              Güncel dönem: <span className="font-medium">{new Date(data.dateFrom).toLocaleDateString('tr-TR')}</span> – <span className="font-medium">{new Date(data.dateTo).toLocaleDateString('tr-TR')}</span>
              {' '}(eşit süreli karşılaştırma)
            </span>
          </div>
        )}

        {/* Quick Stats Row — gerçek değerler (Wave 1 #1.1) */}
        <QuickStatsRow
          activeCompetitors={data?.activeCompetitors ?? (otherSites.length + 1)}
          lastUpdatedAt={data?.lastUpdatedAt ?? null}
        />

        {/* FE-11: Dashboard hero stats benchmark/karşılaştırma notu */}
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          <span className="font-medium">Aktiflik Oranı:</span> Bu dönemde aktif olan kampanyaların toplam kampanyalara oranını gösterir.
          {activeRate > 85 ? ' %85 üzeri sektör ortalamasının üzerinde kabul edilir.' : activeRate > 70 ? ' %70-85 arası sektör ortalamasıdır.' : ' %70 altı sektör ortalamasının altındadır.'}
          Mevcut oranınız: <span className={activeRate > 85 ? 'text-emerald-600 font-semibold' : activeRate > 70 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'}>{activeRate.toFixed(1)}%</span>
        </div>

        {sampleSizeWarning && (
          <AlertBanner
            id={`sample-size-${sampleSizeWarning.variant}-${totalCompetitorCampaigns}`}
            variant={sampleSizeWarning.variant}
            title={sampleSizeWarning.title}
            message={sampleSizeWarning.message}
            dismissable={false}
          />
        )}

        {/* AI COMPARISON HERO */}
        <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">AI Karşılaştırma Paneli</h2>
                {dateFrom && dateTo && (
                  <Badge variant="outline" className="gap-1 ml-2 text-xs font-normal">
                    <CalendarRange className="h-3 w-3" />
                    {formatDateRange(dateFrom, dateTo)}
                  </Badge>
                )}
              </div>
              <select
                className="border rounded px-3 py-1.5 text-sm bg-background"
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
              >
                <option value="">Tüm Kategoriler</option>
                {competitionData?.categories?.map((cat) => (
                  <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
                ))}
              </select>
            </div>

            {competitionLoading ? (
              <div className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : (
              <>
                {/* Main insight cards - larger numbers
                    Tüm değerler seçili tarih aralığı içindir; description'larda
                    dönem bağlamı verilir (kullanıcılar metriği "tüm zamanlar"
                    sanıp yanlış kararlar almasın). */}
                <div className="grid gap-4 md:grid-cols-4 mb-6">
                  <InsightCard
                    icon={Crown}
                    title="Bitalih Pozisyonu"
                    value={bitalihCampaignsBetter ? 'Kampanya Hacminde Lider' : 'Liderin Gerisinde'}
                    description={`${bitalihData?.total_campaigns ?? 0} kampanya · seçili dönem`}
                    tone={bitalihCampaignsBetter ? 'positive' : 'warning'}
                  />
                  <InsightCard
                    icon={BarChart3}
                    title="Kampanya Sayısı"
                    value={bitalihData?.total_campaigns ?? 0}
                    description={`Rakip ortalaması: ${Math.round(avgCompetitorCampaigns)} · seçili dönem`}
                    tone={bitalihCampaignsBetter ? 'positive' : 'info'}
                  />
                  <InsightCard
                    icon={Target}
                    title="Bonus Agresifliği"
                    value={bitalihBonusBetter ? 'En Yüksek Ortalama' : 'Ortalamanın Altında'}
                    description={`En yüksek rakip: ${bestCompetitor?.site_name || '-'} (₺${Math.round(Number(bestCompetitor?.avg_bonus || 0))}) · seçili dönem`}
                    tone={bitalihBonusBetter ? 'positive' : 'warning'}
                  />
                  <InsightCard
                    icon={TrendingUp}
                    title="En Güçlü Kategori"
                    value={data?.topCategories?.[0]?.label || 'Belirsiz'}
                    description={`${data?.topCategories?.[0]?.count || 0} kampanya · seçili dönem`}
                    tone="info"
                  />
                </div>

                {/* Comparison Progress Bars */}
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Kampanya Sayısı */}
                  <div className="space-y-4 p-4 rounded-xl bg-muted/40">
                    <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Kampanya Sayısı Karşılaştırması
                    </h3>
                    <div className="space-y-3">
                      <ComparisonBar 
                        label="Bitalih" 
                        value={Number(bitalihData?.total_campaigns || 0)} 
                        maxValue={maxCampaigns}
                        isPrimary={true}
                        color={bitalihCampaignsBetter ? 'green' : 'primary'}
                      />
                      {otherSites.slice(0, 5).map((site) => (
                        <ComparisonBar 
                          key={site.site_id}
                          label={site.site_name}
                          value={Number(site.total_campaigns)} 
                          maxValue={maxCampaigns}
                          siteCode={site.site_code}
                          onClick={() => handleCompetitorClick(site.site_code, site.site_name)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Ortalama Bonus */}
                  <div className="space-y-4 p-4 rounded-xl bg-muted/40">
                    <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <Crown className="w-4 h-4" />
                      Ortalama Bonus Karşılaştırması
                    </h3>
                    <div className="space-y-3">
                      <ComparisonBar 
                        label="Bitalih" 
                        value={Number(bitalihData?.avg_bonus || 0)} 
                        maxValue={maxBonus}
                        isPrimary={true}
                        color={bitalihBonusBetter ? 'green' : 'primary'}
                      />
                      {otherSites.slice(0, 5).sort((a, b) => Number(b.avg_bonus) - Number(a.avg_bonus)).map((site) => (
                        <ComparisonBar 
                          key={site.site_id}
                          label={site.site_name}
                          value={Number(site.avg_bonus)} 
                          maxValue={maxBonus}
                          siteCode={site.site_code}
                          onClick={() => handleCompetitorClick(site.site_code, site.site_name)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Performance Progress Bars for Categories */}
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <Card className="border-emerald-200 bg-emerald-50/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Kampanya Performansı</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ProgressBar 
                        value={Number(bitalihData?.total_campaigns || 0)} 
                        max={maxCampaigns}
                        label="Bitalih vs En Yüksek Rakip"
                        explanation={`Bitalih'in kampanya sayısı (${bitalihData?.total_campaigns || 0}) en yüksek rakip kampanya sayısına (${maxCampaigns}) oranla: %${Math.round((Number(bitalihData?.total_campaigns || 0) / maxCampaigns) * 100) || 0}`}
                        color="emerald"
                      />
                      <ProgressBar 
                        value={avgCompetitorCampaigns} 
                        max={maxCampaigns}
                        label="Rakip Ortalaması"
                        explanation={`Rakip sitelerin ortalama kampanya sayısı (${Math.round(avgCompetitorCampaigns)}) en yüksek rakibe göre: %${Math.round((avgCompetitorCampaigns / maxCampaigns) * 100) || 0}`}
                        color="blue"
                      />
                    </CardContent>
                  </Card>
                  
                  <Card className="border-violet-200 bg-violet-50/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Bonus Performansı</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ProgressBar 
                        value={Number(bitalihData?.avg_bonus || 0)} 
                        max={maxBonus}
                        label="Bitalih Bonus"
                        explanation={`Bitalih'in ortalama bonus miktarı (₺${Math.round(Number(bitalihData?.avg_bonus || 0))}) en yüksek rakip bonusa (₺${Math.round(Number(bestCompetitor?.avg_bonus || 0))}) oranla: %${Math.round((Number(bitalihData?.avg_bonus || 0) / Number(bestCompetitor?.avg_bonus || 1)) * 100) || 0}`}
                        color="violet"
                      />
                      <ProgressBar 
                        value={Number(bestCompetitor?.avg_bonus || 0)} 
                        max={maxBonus}
                        label="En Yüksek Bonus"
                        explanation={`En yüksek ortalama bonus ₺${Math.round(Number(bestCompetitor?.avg_bonus || 0))} (${bestCompetitor?.site_name ?? '-'})`}
                        color="orange"
                      />
                    </CardContent>
                  </Card>
                </div>

                {/* Quick Summary Banner */}
                <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-violet-500/10 border border-primary/20">
                  <div className="flex items-center gap-4 text-sm">
                    {bitalihCampaignsBetter ? (
                      <div className="flex items-center gap-2 text-emerald-600 font-medium">
                        <div className="p-1 rounded-full bg-emerald-500 text-white">
                          <ArrowUpRight className="h-3 w-3" />
                        </div>
                        <span>Bitalih, rakiplerin {Math.round(avgCompetitorCampaigns)} üzerinde {bitalihData?.total_campaigns} kampanya sunuyor</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-600 font-medium">
                        <div className="p-1 rounded-full bg-amber-500 text-white">
                          <ArrowDownRight className="h-3 w-3" />
                        </div>
                        <span>Bitalih, rakip ortalamasının {Math.round(avgCompetitorCampaigns - Number(bitalihData?.total_campaigns))} altında</span>
                      </div>
                    )}
                    <span className="text-muted-foreground">|</span>
                    <Badge variant="outline" className="bg-primary/10">
                      {data?.topCategories?.[0] ? `En güçlü: ${data.topCategories[0].label}` : 'Kategori verisi yok'}
                    </Badge>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="flex gap-4 text-sm">
          <Link href="/competition" className="text-primary hover:underline flex items-center gap-1">
            <BarChart3 className="w-4 h-4" />
            Detaylı Rekabet Analizi →
          </Link>
          <Link href="/compare" className="text-primary hover:underline flex items-center gap-1">
            <Target className="w-4 h-4" />
            Kampanya Karşılaştır →
          </Link>
          <Link href="/campaigns" className="text-primary hover:underline flex items-center gap-1">
            <Activity className="w-4 h-4" />
            Tüm Kampanyalar →
          </Link>
        </div>
      </main>
    </div>
  )
}
