'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowUp, ArrowDown, Minus, TrendingUp, Calendar, Globe, Megaphone } from 'lucide-react'
import type { WeeklyReport } from '@/types'

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
  if (!reports || reports.length < 2) {
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

  const current = reports[0]
  const previous = reports[1]

  // Get comparison metrics from report data
  const campaignCountChange = calcChange(current.campaignCount, previous.campaignCount)
  const siteCountChange = calcChange(current.siteCoverageCount, previous.siteCoverageCount)
  const activeChange = calcChange(current.activeOverlapCount, previous.activeOverlapCount)

  // Estimate avg bonus from active campaigns ratio (proxy since we don't have exact bonus data in weekly report)
  const avgBonusCurrent = current.campaignCount > 0 ? (current.activeOverlapCount / current.campaignCount) * 100 : 0
  const avgBonusPrevious = previous.campaignCount > 0 ? (previous.activeOverlapCount / previous.campaignCount) * 100 : 0
  const avgBonusChange = calcChange(avgBonusCurrent, avgBonusPrevious)

  // Top 3 changes based on topSites delta (mock for now - would need per-site delta data)
  const topChanges = [
    { siteName: '---', diff: 0 }, // Placeholder - real implementation would calculate from per-site deltas
  ]

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
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Bu Hafta ({current.weekNumber}) vs Geçen Hafta ({previous.weekNumber})
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {/* Top changes - would need per-site delta data */}
        {topChanges.length > 0 && topChanges[0].diff !== 0 && (
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">En Çok Artış</h4>
            <ul className="space-y-1">
              {topChanges.slice(0, 3).map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <ArrowUp className="h-3 w-3 text-green-500" />
                  <span>{item.siteName}</span>
                  <span className="text-green-500">+{item.diff} kampanya</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
