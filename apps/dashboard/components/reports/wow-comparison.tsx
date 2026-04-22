'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowUp, ArrowDown, Minus, TrendingUp, Calendar, Globe, Megaphone, AlertTriangle } from 'lucide-react'
import type { WeeklyReport } from '@/types'
import { fetchWowDeltas } from '@/lib/api'
import { SampleBadge } from '@/components/ui/sample-badge'
import { getSampleConfidence } from '@/lib/sample-size'

interface WowComparisonProps {
  reports: WeeklyReport[]
}

interface WowMetrics {
  campaignCount: { current: number; previous: number; diff: number; pct: number; direction: 'up' | 'down' | 'neutral' }
  avgBonus: { current: number; previous: number; diff: number; pct: number; direction: 'up' | 'down' | 'neutral' }
  activeSites: { current: number; previous: number; diff: number; pct: number; direction: 'up' | 'down' | 'neutral' }
  topChanges: { siteName: string; diff: number }[]
}

interface ChangeResult {
  diff: number
  pct: number
  direction: 'up' | 'down' | 'neutral'
}

function calcChange(current: number, previous: number): ChangeResult {
  if (previous === 0) {
    return {
      diff: current,
      pct: current > 0 ? 100 : 0,
      direction: current > 0 ? 'up' : current < 0 ? 'down' : 'neutral',
    }
  }
  const diff = current - previous
  const pct = Math.round((diff / previous) * 100)
  const direction: 'up' | 'down' | 'neutral' = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral'
  return { diff, pct, direction }
}

export function WowComparison({ reports }: WowComparisonProps) {
  const hasEnoughReports = Boolean(reports && reports.length >= 2)
  const current = hasEnoughReports ? reports[0] : null
  const previous = hasEnoughReports ? reports[1] : null

  // Hooks must be called unconditionally — call useQuery before any early return.
  const { data: wowData } = useQuery({
    queryKey: ['wow-deltas', current?.weekStart, current?.weekEnd],
    queryFn: () =>
      fetchWowDeltas({
        from: current!.weekStart,
        to: current!.weekEnd,
        limit: 5,
      }),
    enabled: Boolean(current?.weekStart && current?.weekEnd),
  })

  if (!hasEnoughReports || !current || !previous) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Hafta-Hafta Karşılaştırma
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Karşılaştırma için en az 2 haftalık rapor gerekiyor.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Get comparison metrics from report data
  const campaignCountChange = calcChange(current.campaignCount, previous.campaignCount)
  const siteCountChange = calcChange(current.siteCoverageCount, previous.siteCoverageCount)
  const activeChange = calcChange(current.activeOverlapCount, previous.activeOverlapCount)

  const topChanges = (wowData?.topChanges ?? []).map((entry) => ({
    siteName: entry.siteName,
    siteCode: entry.siteCode,
    diff: entry.diff,
    current: entry.current,
    previous: entry.previous,
  }))

  // Wave 1 #1.3 — Yetersiz örneklem rozet eşiği (mevcut + önceki dönem birlikte).
  const totalCampaignsObserved = current.campaignCount + previous.campaignCount
  const sampleConfidence = getSampleConfidence(totalCampaignsObserved)
  const sampleInsufficient = sampleConfidence === 'low' || totalCampaignsObserved < 10

  const renderArrow = (direction: 'up' | 'down' | 'neutral') => {
    if (direction === 'up') return <ArrowUp className="h-4 w-4 text-green-500" />
    if (direction === 'down') return <ArrowDown className="h-4 w-4 text-red-500" />
    return <Minus className="h-4 w-4 text-muted-foreground" />
  }

  const renderPct = (pct: number, direction: 'up' | 'down' | 'neutral') => {
    if (direction === 'neutral') return <span className="text-muted-foreground">%0</span>
    const color = direction === 'up' ? 'text-green-500' : 'text-red-500'
    return <span className={color}>↑ %{Math.abs(pct)}</span>
  }

  return (
    <Card className="border-primary/15">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Hafta-Hafta Karşılaştırma
          <SampleBadge n={totalCampaignsObserved} compact />
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Bu Hafta ({current.weekNumber}) vs Geçen Hafta ({previous.weekNumber})
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Wave 1 #1.3 — n<10 ise satıra yetersiz veri overlay */}
        {sampleInsufficient && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium text-orange-800">Yetersiz veri</p>
              <p className="text-orange-700/80">
                Bu karşılaştırma sadece {totalCampaignsObserved} kampanyaya dayanıyor; trend
                yorumu yapmadan önce daha fazla gözlem birikmesini bekleyin.
              </p>
            </div>
          </div>
        )}
        {/* Metrics grid */}
        <div className="grid gap-3 md:grid-cols-3">
          {/* Campaign Count */}
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Kampanya</span>
              </div>
              {renderArrow(campaignCountChange.direction)}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold">{current.campaignCount}</span>
              <span className="text-sm text-muted-foreground">/ {previous.campaignCount}</span>
            </div>
            <div className="mt-1 text-xs">
              {renderPct(campaignCountChange.pct, campaignCountChange.direction)}
            </div>
          </div>

          {/* Active Sites */}
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Aktif Site</span>
              </div>
              {renderArrow(siteCountChange.direction)}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold">{current.siteCoverageCount}</span>
              <span className="text-sm text-muted-foreground">/ {previous.siteCoverageCount}</span>
            </div>
            <div className="mt-1 text-xs">
              {renderPct(siteCountChange.pct, siteCountChange.direction)}
            </div>
          </div>

          {/* Active Overlap (proxy for avg bonus) */}
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Aktif Hacim</span>
              </div>
              {renderArrow(activeChange.direction)}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold">{current.activeOverlapCount}</span>
              <span className="text-sm text-muted-foreground">/ {previous.activeOverlapCount}</span>
            </div>
            <div className="mt-1 text-xs">
              {renderPct(activeChange.pct, activeChange.direction)}
            </div>
          </div>
        </div>

        {/* Wave 1 #1.2 — Per-site delta gerçek API'den gelir */}
        {topChanges.length > 0 ? (
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">
              Site Bazında En Büyük Değişimler
            </h4>
            <ul className="space-y-1.5">
              {topChanges.slice(0, 5).map((item) => {
                const dir: 'up' | 'down' | 'neutral' =
                  item.diff > 0 ? 'up' : item.diff < 0 ? 'down' : 'neutral'
                const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus
                const color =
                  dir === 'up' ? 'text-green-600' : dir === 'down' ? 'text-red-600' : 'text-muted-foreground'
                return (
                  <li key={item.siteCode} className="flex items-center gap-2 text-sm">
                    <Icon className={`h-3 w-3 ${color}`} />
                    <span className="font-medium flex-1">{item.siteName}</span>
                    <SampleBadge n={item.current + item.previous} compact />
                    <span className={`${color} text-xs tabular-nums`}>
                      {item.diff > 0 ? '+' : ''}
                      {item.diff} kampanya
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ({item.previous} → {item.current})
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground text-center">
            Site bazında delta hesaplanamadı (henüz yeterli veri yok).
          </div>
        )}
      </CardContent>
    </Card>
  )
}
