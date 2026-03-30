'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/ui/error'
import { fetchReportSummary, fetchCompetition } from '@/lib/api'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function DashboardPage() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')

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
    ? otherSites.reduce((sum, s) => sum + s.total_campaigns, 0) / otherSites.length
    : 0
  const bestCompetitor = otherSites.length > 0
    ? otherSites.reduce((best, s) => (s.avg_bonus > (best?.avg_bonus || 0) ? s : best), otherSites[0])
    : null

  const bitalihComparisonCards = [
    {
      title: 'Bitalih vs Ortalama',
      subtitle: 'Kampanya Sayısı',
      bitalihValue: bitalihData?.total_campaigns ?? 0,
      competitorValue: Math.round(avgCompetitorCampaigns),
      better: (bitalihData?.total_campaigns ?? 0) > avgCompetitorCampaigns ? 'bitalih' : 'competitor',
      suffix: 'kampanya',
    },
    {
      title: 'Bitalih vs En İyi',
      subtitle: 'Bonus Değeri',
      bitalihValue: bitalihData?.avg_bonus ?? 0,
      competitorValue: bestCompetitor?.avg_bonus ?? 0,
      better: (bitalihData?.avg_bonus ?? 0) > (bestCompetitor?.avg_bonus ?? 0) ? 'bitalih' : 'competitor',
      suffix: '₺',
      prefix: '₺',
    },
  ]

  if (error) {
    return <ErrorDisplay error={error} onRetry={handleRefresh} />
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Yenile
          </Button>
        </div>
      </header>

      <main className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Tarih Aralığı:</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
            <span>-</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
          </div>
        </div>

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

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>En Çok Görülen Kategoriler</CardTitle>
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
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span>{item.category}</span>
                      <span className="text-muted-foreground">{item.count}</span>
                    </div>
                  ))}
                  {(!data?.topCategories || data.topCategories.length === 0) && (
                    <p className="text-sm text-muted-foreground">Veri yok</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>En Çok Kampanya Olan Siteler</CardTitle>
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
                    <p className="text-sm text-muted-foreground">Veri yok</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              AI Karşılaştırma Paneli
              <Badge variant="outline">Bitalih vs Rakipler</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Tür Filtresi:</label>
              <select
                className="border rounded px-3 py-1.5 text-sm"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">Tüm Kategoriler</option>
                {competitionData?.categories?.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
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
                          const maxCampaigns = Math.max(...(competitionData?.siteRankings?.map(s => s.total_campaigns) || [1]))
                          const width = (site.total_campaigns / maxCampaigns) * 100
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
                            Bitalih <strong>{bitalihData.total_campaigns}</strong> kampanya ile{' '}
                            {bitalihData.total_campaigns > avgCompetitorCampaigns
                              ? 'ortalama rakipten'
                              : 'ortalama rakipten'}{' '}
                            <strong>{Math.abs(Math.round(bitalihData.total_campaigns - avgCompetitorCampaigns))}</strong> {' '}
                            {bitalihData.total_campaigns > avgCompetitorCampaigns ? 'daha fazla' : 'daha az'} kampanya sunuyor.
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium min-w-20">Bonus:</span>
                          <span>
                            Bitalih&apos;in ortalama bonus değeri <strong>₺{Math.round(bitalihData.avg_bonus || 0)}</strong>.
                            {bestCompetitor && bitalihData.avg_bonus > bestCompetitor.avg_bonus
                              ? ` ${bestCompetitor.site_name} (₺${Math.round(bestCompetitor.avg_bonus)}) rakibinden daha yüksek.`
                              : bestCompetitor
                              ? ` En yüksek bonus ${bestCompetitor.site_name} (₺${Math.round(bestCompetitor.avg_bonus)}).`
                              : ''}
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium min-w-20">Tür:</span>
                          <span>
                            Bitalih <strong>{bitalihData.categories_count}</strong> farklı kategoride kampanya sunuyor.
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
