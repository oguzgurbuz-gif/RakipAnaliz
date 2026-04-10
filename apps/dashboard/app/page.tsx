'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/ui/error'
import { EmptyState } from '@/components/ui/empty-state'
import { InsightCard } from '@/components/ui/insight-card'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { fetchReportSummary, fetchCompetition } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getCategoryLabel } from '@/lib/category-labels'
import { useSSE } from '@/hooks/useSSE'
import { AlertTriangle, BarChart3, Crown, Target, TrendingUp, ShieldAlert, Sparkles } from 'lucide-react'

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()

  const getParam = (key: string, defaultValue: string = ''): string => {
    if (!searchParams) return defaultValue
    return searchParams.get(key) || defaultValue
  }

  const [dateFrom, setDateFrom] = useState(getParam('dateFrom'))
  const [dateTo, setDateTo] = useState(getParam('dateTo'))
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

  const handleDateFromChange = (value: string) => {
    setDateFrom(value)
    updateUrl({ dateFrom: value || undefined })
  }

  const handleDateToChange = (value: string) => {
    setDateTo(value)
    updateUrl({ dateTo: value || undefined })
  }

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value)
    updateUrl({ selectedCategory: value || undefined })
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-summary', dateFrom, dateTo],
    queryFn: () => fetchReportSummary(dateFrom || undefined, dateTo || undefined),
  })

  const { data: competitionData, isLoading: competitionLoading } = useQuery({
    queryKey: ['competition', selectedCategory],
    queryFn: () => fetchCompetition(selectedCategory || undefined),
  })

  const handleRefresh = () => {
    refetch()
  }

  const bitalihData = competitionData?.siteRankings?.find(s => s.site_code === 'bitalih')
  const otherSites = competitionData?.siteRankings?.filter(s => s.site_code !== 'bitalih') || []
  const avgCompetitorCampaigns = otherSites.length > 0
    ? otherSites.reduce((sum, s) => sum + Number(s.total_campaigns), 0) / otherSites.length
    : 0
  const bestCompetitor = otherSites.length > 0
    ? otherSites.reduce((best, s) => (Number(s.avg_bonus || 0) > Number(best?.avg_bonus || 0) ? s : best), otherSites[0])
    : null

  const bitalihComparisonCards = [
    {
      title: 'Bitalih vs Ortalama',
      subtitle: 'Kampanya Sayısı',
      bitalihValue: Number(bitalihData?.total_campaigns ?? 0),
      competitorValue: Math.round(Number(avgCompetitorCampaigns)),
      better: (bitalihData?.total_campaigns ?? 0) > avgCompetitorCampaigns ? 'bitalih' : 'competitor',
      suffix: 'kampanya',
    },
    {
      title: 'Bitalih vs En İyi',
      subtitle: 'Bonus Değeri',
      bitalihValue: Number(bitalihData?.avg_bonus ?? 0),
      competitorValue: Number(bestCompetitor?.avg_bonus ?? 0),
      better: (bitalihData?.avg_bonus ?? 0) > (bestCompetitor?.avg_bonus ?? 0) ? 'bitalih' : 'competitor',
      suffix: '₺',
      prefix: '₺',
    },
  ]

  const dashboardInsights = data
    ? [
        `${data.startedCount} kampanya son aralıkta başladı ve ${data.activeCount} kampanya halen görünür durumda.`,
        data.topCategories?.[0]
          ? `En görünür tema ${data.topCategories[0].label || getCategoryLabel(data.topCategories[0].category)} olarak öne çıkıyor.`
          : 'Kategori dağılımı zayıf; veri kalitesi düşük olabilir.',
        bestCompetitor
          ? `${bestCompetitor.site_name} ortalama bonus değerinde en agresif rakip görünüyor.`
          : 'Rakip bonus kıyaslaması için yeterli veri yok.',
      ]
    : []

  const focusTone = (bitalihData?.total_campaigns ?? 0) >= avgCompetitorCampaigns ? 'positive' : 'warning'
  const focusMessage = (bitalihData?.total_campaigns ?? 0) >= avgCompetitorCampaigns
    ? 'Bitalih kampanya hacminde rakip ortalamasının üzerinde.'
    : 'Bitalih kampanya hacminde rakip ortalamasının gerisinde.'

  if (error) {
    return <ErrorDisplay error={error} onRetry={handleRefresh} />
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Dashboard"
        description="Kampanya hareketliliğini, kategori dağılımını ve Bitalih'in rakipler karşısındaki pozisyonunu tek bakışta takip edin."
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Yenile
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Tarih Aralığı:</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateFromChange(e.target.value)}
            className="w-40 bg-background"
          />
          <span>-</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateToChange(e.target.value)}
            className="w-40 bg-background"
          />
        </div>
      </PageHeader>

      <main className="p-6 space-y-6">
        {!isLoading && data && (
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-blue-50/50">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <Badge variant="info" className="w-fit">Haftalık Özet</Badge>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Bu dönemde odak alanı: {data.topCategories?.[0]?.label || 'kategori görünürlüğü'}
                    </h2>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      {dashboardInsights[0]} {dashboardInsights[1]}
                    </p>
                  </div>
                  <div className="min-w-[220px] rounded-2xl border border-border/70 bg-background/80 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Öne Çıkan Not</div>
                    <div className="mt-2 flex items-start gap-2">
                      <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-600" />
                      <p className="text-sm">{dashboardInsights[2]}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <InsightCard
              icon={focusTone === 'positive' ? Sparkles : AlertTriangle}
              title="Bitalih Odak Notu"
              description={focusMessage}
              value={`${Number(bitalihData?.total_campaigns ?? 0)} kampanya`}
              tone={focusTone}
            />
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Bu Hafta Başlayan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.startedCount ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Bu Hafta Biten
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.endedCount ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Bu Hafta Aktif
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.activeCount ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Bu Hafta Pasif
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.passiveCount ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Bu Hafta Değişen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.changedCount ?? 0}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {!isLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <InsightCard icon={TrendingUp} title="Başlayan" value={data?.startedCount ?? 0} description="Seçilen aralıkta ilk kez görülen kampanyalar" />
            <InsightCard icon={BarChart3} title="Aktif Kampanya" value={data?.activeCount ?? 0} description="Şu anda görünür ve devam eden kampanyalar" />
            <InsightCard icon={Target} title="Rakip Ortalama" value={Math.round(avgCompetitorCampaigns)} description="Rakip başına ortalama kampanya sayısı" tone="info" />
            <InsightCard icon={Crown} title="En Güçlü Rakip" value={bestCompetitor?.site_name || '-'} description={bestCompetitor ? `Ort. bonus ₺${Number(bestCompetitor.avg_bonus).toFixed(0)}` : 'Yeterli veri yok'} tone="warning" />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <SectionHeader
                title="En Çok Görülen Kategoriler"
                description="Junk kayıtlar filtrelenerek, en görünür kampanya tipleri özetlenir."
              />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {data?.topCategories?.slice(0, 10).map((item, index) => (
                    <div key={index} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">{item.label || getCategoryLabel(item.category)}</span>
                        <div className="text-right">
                          <div>{item.count}</div>
                          {item.share !== undefined && (
                            <div className="text-xs text-muted-foreground">
                              %{Math.round(item.share * 100)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${Math.max(8, Math.round((item.share || 0) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {(!data?.topCategories || data.topCategories.length === 0) && (
                    <EmptyState title="Anlamlı kategori verisi yok" description="Bu aralıkta güvenilir kategori dağılımı üretilemedi." />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionHeader
                title="En Çok Kampanya Olan Siteler"
                description="Seçilen tarih aralığında en yoğun kampanya üreten siteler."
              />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {data?.topSites?.slice(0, 10).map((item, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span>{item.siteName}</span>
                      <span className="text-muted-foreground">{item.count}</span>
                    </div>
                  ))}
                  {(!data?.topSites || data.topSites.length === 0) && (
                    <EmptyState title="Site özeti yok" description="Bu tarih aralığında listelenecek site yoğunluğu bulunamadı." />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <SectionHeader
              title="AI Karşılaştırma Paneli"
              description="Bitalih'in kampanya hacmi ve bonus agresifliği açısından rakiplerle konumunu karşılaştırın."
              action={<Badge variant="outline">Bitalih vs Rakipler</Badge>}
            />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Tür Filtresi:</label>
              <select
                className="border rounded px-3 py-1.5 text-sm"
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
              <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-3">
                  <InsightCard
                    icon={Crown}
                    title="Bitalih'in Öne Çıktığı Alan"
                    value={bitalihComparisonCards[0].better === 'bitalih' ? 'Hacim' : 'Sınırlı'}
                    description={bitalihComparisonCards[0].better === 'bitalih'
                      ? 'Kampanya sayısında rakip ortalamasının üzerinde.'
                      : 'Kampanya hacminde rakip ortalamasını yakalamak gerekiyor.'}
                    tone={bitalihComparisonCards[0].better === 'bitalih' ? 'positive' : 'warning'}
                  />
                  <InsightCard
                    icon={Target}
                    title="En Agresif Rakip"
                    value={bestCompetitor?.site_name || '-'}
                    description={bestCompetitor ? `Ort. bonus ₺${Number(bestCompetitor.avg_bonus).toFixed(0)}` : 'Bonus verisi sınırlı'}
                    tone="warning"
                  />
                  <InsightCard
                    icon={TrendingUp}
                    title="Odaklanılacak Tür"
                    value={data?.topCategories?.[0]?.label || 'Belirsiz'}
                    description="Kampanya görünürlüğünün en yoğun olduğu kategori."
                    tone="info"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {bitalihComparisonCards.map((card, index) => (
                    <Card key={index} className={card.better === 'bitalih' ? 'border-green-500' : 'border-orange-500'}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-primary">
                            {card.prefix || ''}{card.bitalihValue}{card.suffix}
                          </span>
                          <span className="text-sm text-muted-foreground">vs</span>
                          <span className="text-xl font-semibold text-muted-foreground">
                            {card.prefix || ''}{card.competitorValue}{card.suffix}
                          </span>
                        </div>
                        <p className="text-xs mt-2">
                          {card.better === 'bitalih' ? (
                            <span className="text-green-600">Bitalih daha iyi</span>
                          ) : (
                            <span className="text-orange-600">Rakipler daha iyi</span>
                          )}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Kampanya Sayısı Karşılaştırması</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {competitionData?.siteRankings?.slice(0, 6).map((site) => {
                          const totalCamp = Number(site.total_campaigns) || 0
                          const maxCampaigns = Math.max(...(competitionData?.siteRankings?.map(s => Number(s.total_campaigns)) || [1]))
                          const width = maxCampaigns > 0 ? (totalCamp / maxCampaigns) * 100 : 0
                          const isBitalih = site.site_code === 'bitalih'
                          return (
                            <div key={site.site_id} className="flex items-center gap-3">
                              <span className={`text-xs w-20 truncate ${isBitalih ? 'font-bold text-primary' : ''}`}>
                                {site.site_name}
                              </span>
                              <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isBitalih ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                                  style={{ width: `${width}%` }}
                                />
                              </div>
                              <span className="text-xs w-8 text-right">{site.total_campaigns}</span>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Ortalama Bonus Değeri Karşılaştırması</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {competitionData?.siteRankings?.slice(0, 6).map((site) => {
                          const maxBonus = Math.max(...(competitionData?.siteRankings?.map(s => s.avg_bonus) || [1]))
                          const width = maxBonus > 0 ? ((site.avg_bonus || 0) / maxBonus) * 100 : 0
                          const isBitalih = site.site_code === 'bitalih'
                          return (
                            <div key={site.site_id} className="flex items-center gap-3">
                              <span className={`text-xs w-20 truncate ${isBitalih ? 'font-bold text-primary' : ''}`}>
                                {site.site_name}
                              </span>
                              <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isBitalih ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                                  style={{ width: `${width}%` }}
                                />
                              </div>
                              <span className="text-xs w-12 text-right">₺{Math.round(site.avg_bonus || 0)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Kategori Dağılımı (Bitalih)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {competitionData?.comparisonTable && competitionData.comparisonTable.length > 0 ? (
                      <div className="space-y-3">
                        {competitionData.comparisonTable.slice(0, 8).map((row, index) => {
                          const bitalihInCat = competitionData.siteRankings?.find(s => s.site_code === 'bitalih')
                          const bitalihCount = bitalihInCat?.total_campaigns || 0
                          const bitalihPercentage = row.total_campaigns > 0
                            ? Math.round((bitalihCount / row.total_campaigns) * 100)
                            : 0
                          return (
                            <div key={index} className="flex items-center justify-between text-sm">
                              <span className="truncate flex-1">{row.category}</span>
                              <div className="flex items-center gap-4">
                                <span className="text-muted-foreground text-xs">
                                  {row.total_campaigns} kampanya
                                </span>
                                <Badge variant={bitalihPercentage > 30 ? 'default' : 'secondary'} className="text-xs">
                                  Bitalih: %{bitalihPercentage}
                                </Badge>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Veri yok</p>
                    )}
                  </CardContent>
                </Card>

                {bitalihData && otherSites.length > 0 && (
                  <Card className="bg-muted/50">
                    <CardHeader>
                      <CardTitle className="text-sm">AI Özet Karşılaştırma</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        <div className="flex items-start gap-2">
                          <span className="font-medium min-w-20">Kampanya:</span>
                          <span>
                            Bitalih <strong>{Number(bitalihData?.total_campaigns ?? 0)}</strong> kampanya ile{' '}
                            {Number(bitalihData?.total_campaigns ?? 0) > avgCompetitorCampaigns
                              ? 'ortalama rakipten'
                              : 'ortalama rakipten'}{' '}
                            <strong>{Math.abs(Math.round(Number(bitalihData?.total_campaigns ?? 0) - avgCompetitorCampaigns))}</strong> {' '}
                            {Number(bitalihData?.total_campaigns ?? 0) > avgCompetitorCampaigns ? 'daha fazla' : 'daha az'} kampanya sunuyor.
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium min-w-20">Bonus:</span>
                          <span>
                            Bitalih&apos;in ortalama bonus değeri <strong>₺{Math.round(Number(bitalihData?.avg_bonus || 0))}</strong>.
                            {bestCompetitor && Number(bitalihData?.avg_bonus || 0) > Number(bestCompetitor.avg_bonus || 0)
                              ? ` ${bestCompetitor.site_name} (₺${Math.round(Number(bestCompetitor.avg_bonus || 0))}) rakibinden daha yüksek.`
                              : bestCompetitor
                              ? ` En yüksek bonus ${bestCompetitor.site_name} (₺${Math.round(Number(bestCompetitor.avg_bonus || 0))}).`
                              : ''}
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium min-w-20">Tür:</span>
                          <span>
                            Bitalih <strong>{Number(bitalihData?.categories_count || 0)}</strong> farklı kategoride kampanya sunuyor.
                            Toplam <strong>{competitionData?.categories?.length || 0}</strong> kategori mevcut.
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
