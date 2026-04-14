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
import { Crown, Target, TrendingUp, Sparkles, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

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

  if (error) {
    return <ErrorDisplay error={error} onRetry={handleRefresh} />
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Dashboard"
        description="Rakiplerle karşılaştırmalı kampanya analizi"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Tarih:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
                className="border rounded px-2 py-1 text-sm bg-background"
              />
              <span>-</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleDateToChange(e.target.value)}
                className="border rounded px-2 py-1 text-sm bg-background"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              Yenile
            </Button>
          </div>
        }
      />

      <main className="p-6 space-y-6">
        {/* AI COMPARISON HERO - Top of page */}
        <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">AI Karşılaştırma Paneli</h2>
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
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <>
                {/* Main comparison stats */}
                <div className="grid gap-4 md:grid-cols-4 mb-6">
                  <InsightCard
                    icon={Crown}
                    title="Bitalih Pozisyonu"
                    value={bitalihCampaignsBetter ? 'Üst Sırada' : 'Geliştirilmeli'}
                    description={`${bitalihData?.total_campaigns ?? 0} kampanya hacmi`}
                    tone={bitalihCampaignsBetter ? 'positive' : 'warning'}
                  />
                  <InsightCard
                    icon={BarChart3}
                    title="Kampanya Sayısı"
                    value={bitalihData?.total_campaigns ?? 0}
                    description={`Rakip ort: ${Math.round(avgCompetitorCampaigns)}`}
                    tone={bitalihCampaignsBetter ? 'positive' : 'info'}
                  />
                  <InsightCard
                    icon={Target}
                    title="Bonus Agresifliği"
                    value={bitalihBonusBetter ? 'Üst Sırada' : 'Ortalama'}
                    description={`En yüksek: ${bestCompetitor?.site_name || '-'} (₺${Math.round(Number(bestCompetitor?.avg_bonus || 0))})`}
                    tone={bitalihBonusBetter ? 'positive' : 'warning'}
                  />
                  <InsightCard
                    icon={TrendingUp}
                    title="En Güçlü Kategori"
                    value={data?.topCategories?.[0]?.label || 'Belirsiz'}
                    description={`${data?.topCategories?.[0]?.count || 0} kampanya`}
                    tone="info"
                  />
                </div>

                {/* Bitalih vs Rakipler comparison bars */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">Kampanya Sayısı</h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold w-20">Bitalih</span>
                        <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full flex items-center justify-end pr-2 text-xs font-medium text-white',
                              bitalihCampaignsBetter ? 'bg-green-500' : 'bg-primary'
                            )}
                            style={{ width: '100%' }}
                          />
                        </div>
                        <span className="text-sm font-semibold w-12 text-right">{bitalihData?.total_campaigns ?? 0}</span>
                      </div>
                      {otherSites.slice(0, 4).map((site) => {
                        const width = bitalihData?.total_campaigns 
                          ? (Number(site.total_campaigns) / Number(bitalihData.total_campaigns)) * 100 
                          : 0
                        return (
                          <div key={site.site_id} className="flex items-center gap-3">
                            <span className="text-xs w-20 truncate text-muted-foreground">{site.site_name}</span>
                            <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                              <div
                                className="h-full bg-muted-foreground/30 rounded-full"
                                style={{ width: `${Math.min(100, width)}%` }}
                              />
                            </div>
                            <span className="text-xs w-12 text-right">{site.total_campaigns}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">Ortalama Bonus</h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold w-20">Bitalih</span>
                        <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full flex items-center justify-end pr-2 text-xs font-medium text-white',
                              bitalihBonusBetter ? 'bg-green-500' : 'bg-primary'
                            )}
                            style={{ width: '100%' }}
                          />
                        </div>
                        <span className="text-sm font-semibold w-16 text-right">₺{Math.round(Number(bitalihData?.avg_bonus || 0))}</span>
                      </div>
                      {otherSites.slice(0, 4).sort((a, b) => Number(b.avg_bonus) - Number(a.avg_bonus)).map((site) => {
                        const maxBonus = bitalihData?.avg_bonus || 1
                        const width = (Number(site.avg_bonus) / Number(maxBonus)) * 100
                        return (
                          <div key={site.site_id} className="flex items-center gap-3">
                            <span className="text-xs w-20 truncate text-muted-foreground">{site.site_name}</span>
                            <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                              <div
                                className="h-full bg-muted-foreground/30 rounded-full"
                                style={{ width: `${Math.min(100, width)}%` }}
                              />
                            </div>
                            <span className="text-xs w-16 text-right">₺{Math.round(Number(site.avg_bonus))}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Quick summary */}
                <div className="mt-6 p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-4 text-sm">
                    {bitalihCampaignsBetter ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <ArrowUpRight className="h-4 w-4" />
                        <span>Bitalih kampanya hacminde {Math.round(Number(bitalihData?.total_campaigns) - avgCompetitorCampaigns)} adet fazla kampanya sunuyor</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-amber-600">
                        <ArrowDownRight className="h-4 w-4" />
                        <span>Bitalih rakip ortalamasının {Math.round(avgCompetitorCampaigns - Number(bitalihData?.total_campaigns))} altında</span>
                      </div>
                    )}
                    <span className="text-muted-foreground">|</span>
                    <span>{data?.topCategories?.[0] ? `En güçlü kategori: ${data.topCategories[0].label}` : 'Kategori verisi yok'}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats - Minimal */}
        <div className="grid gap-4 md:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))
          ) : (
            <>
              <InsightCard
                icon={BarChart3}
                title="Bu Dönem"
                value={data?.startedCount ?? 0}
                description={`${data?.activeCount ?? 0} aktif kampanya`}
              />
              <InsightCard
                icon={Target}
                title="Rakip Ortalaması"
                value={Math.round(avgCompetitorCampaigns)}
                description="Kampanya/siteler"
                tone="info"
              />
              <InsightCard
                icon={Crown}
                title="En Agresif Rakip"
                value={bestCompetitor?.site_name || '-'}
                description={bestCompetitor ? `Ort. ₺${Math.round(Number(bestCompetitor.avg_bonus))} bonus` : 'Veri yok'}
                tone="warning"
              />
            </>
          )}
        </div>

        {/* Quick Links */}
        <div className="flex gap-4 text-sm">
          <Link href="/competition" className="text-primary hover:underline">
            Detaylı Rekabet Analizi →
          </Link>
          <Link href="/compare" className="text-primary hover:underline">
            Kampanya Karşılaştır →
          </Link>
          <Link href="/campaigns" className="text-primary hover:underline">
            Tüm Kampanyalar →
          </Link>
        </div>
      </main>
    </div>
  )
}
