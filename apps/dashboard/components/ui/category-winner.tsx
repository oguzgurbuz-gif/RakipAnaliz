'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Crown, Trophy, Medal, Target, AlertTriangle } from 'lucide-react'
import { getCategoryLabel } from '@/lib/category-labels'
import { fetchCompetition, type CompetitionData } from '@/lib/api'
import { formatCurrency, formatNumber } from '@/lib/format/currency'
import { getSiteDisplayName } from '@/lib/i18n/site'

interface CategoryWinnerEntry {
  category: string
  winner: {
    site_name: string
    site_code: string
    campaign_count: number
    avg_bonus: number
  }
  runner_up: {
    site_name: string
    site_code: string
    campaign_count: number
    avg_bonus: number
  } | null
  total_competitors: number
}

// The API returns topByCategory pre-sorted by campaign_count DESC. We just
// project it into the shape the card wants and keep the first few categories
// (too many cards clutters the dashboard — the full breakdown lives in the
// comparison table elsewhere).
function deriveCategoryWinners(data: CompetitionData | undefined, limit = 6): CategoryWinnerEntry[] {
  if (!data?.topByCategory) return []
  const entries: CategoryWinnerEntry[] = []
  for (const [category, sites] of Object.entries(data.topByCategory)) {
    if (!sites.length) continue
    const [winner, runnerUp] = sites
    entries.push({
      category,
      winner: {
        site_name: winner.site_name,
        site_code: winner.site_code,
        campaign_count: winner.count,
        avg_bonus: winner.avg_bonus,
      },
      runner_up: runnerUp
        ? {
            site_name: runnerUp.site_name,
            site_code: runnerUp.site_code,
            campaign_count: runnerUp.count,
            avg_bonus: runnerUp.avg_bonus,
          }
        : null,
      total_competitors: sites.length,
    })
  }
  entries.sort((a, b) => b.winner.campaign_count - a.winner.campaign_count)
  return entries.slice(0, limit)
}

function WinnerBadge() {
  return (
    <Badge variant="winner" className="gap-1">
      <Crown className="h-3 w-3" />
      Kazanan
    </Badge>
  )
}

function RunnerUpBadge() {
  return (
    <Badge variant="secondary" className="gap-1">
      <Medal className="h-3 w-3" />
      İkinci
    </Badge>
  )
}

interface CategoryWinnerCardProps {
  category: string
  winner: CategoryWinnerEntry['winner']
  runner_up: CategoryWinnerEntry['runner_up']
  total_competitors: number
}

function CategoryWinnerCard({ category, winner, runner_up, total_competitors }: CategoryWinnerCardProps) {
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            {getCategoryLabel(category)}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {total_competitors} rakip
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500 text-white shadow-sm">
              <Crown className="h-4 w-4" />
            </div>
            <div>
              {/* FE-8: Site adı + ₺ format'ı merkezi helper'lardan. */}
              <p className="font-semibold text-sm">
                {getSiteDisplayName(winner.site_code, winner.site_name)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatNumber(winner.campaign_count)} kampanya • {formatCurrency(winner.avg_bonus)} ortalama bonus
              </p>
            </div>
          </div>
          <WinnerBadge />
        </div>

        {runner_up ? (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-muted">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted-foreground/20 text-muted-foreground shadow-sm">
                <Trophy className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-sm">
                  {getSiteDisplayName(runner_up.site_code, runner_up.site_name)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(runner_up.campaign_count)} kampanya • {formatCurrency(runner_up.avg_bonus)} ortalama bonus
                </p>
              </div>
            </div>
            <RunnerUpBadge />
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-muted/30 border border-muted text-xs text-muted-foreground">
            İkinci rakip yok — kategoride tek aktif site.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SkeletonCard() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-16 bg-muted animate-pulse rounded-lg" />
        <div className="h-16 bg-muted animate-pulse rounded-lg" />
      </CardContent>
    </Card>
  )
}

interface CategoryWinnerWidgetProps {
  dateRange?: { from?: string; to?: string }
}

export function CategoryWinnerWidget({ dateRange }: CategoryWinnerWidgetProps = {}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['competition', { dateRange }],
    queryFn: () => fetchCompetition(undefined, dateRange),
  })

  const winners = React.useMemo(() => deriveCategoryWinners(data), [data])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5 text-yellow-600" />
        <h2 className="text-lg font-semibold">Kategori Kazananları</h2>
      </div>

      {isError ? (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Kategori verisi yüklenemedi. Birazdan tekrar dene.
        </div>
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : winners.length === 0 ? (
        <div className="p-6 rounded-lg bg-muted/30 border border-muted text-sm text-muted-foreground text-center">
          Seçili dönemde kategori verisi bulunamadı.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {winners.map((item) => (
            <CategoryWinnerCard
              key={item.category}
              category={item.category}
              winner={item.winner}
              runner_up={item.runner_up}
              total_competitors={item.total_competitors}
            />
          ))}
        </div>
      )}
    </div>
  )
}
