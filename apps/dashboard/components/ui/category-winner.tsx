'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Crown, Trophy, Medal, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCategoryLabel } from '@/lib/category-labels'

// Mock data for category winners
const MOCK_CATEGORY_WINNERS = [
  {
    category: 'casino',
    winner: {
      site_name: 'Bitalih',
      site_code: 'bitalih',
      campaign_count: 847,
      avg_bonus: 12500,
    },
    runner_up: {
      site_name: 'Nesine',
      site_code: 'nesine',
      campaign_count: 723,
      avg_bonus: 11200,
    },
    total_competitors: 11,
  },
  {
    category: 'sports',
    winner: {
      site_name: 'Bilyoner',
      site_code: 'bilyoner',
      campaign_count: 612,
      avg_bonus: 8900,
    },
    runner_up: {
      site_name: 'Bitalih',
      site_code: 'bitalih',
      campaign_count: 598,
      avg_bonus: 9500,
    },
    total_competitors: 11,
  },
  {
    category: 'poker',
    winner: {
      site_name: 'Misli',
      site_code: 'misli',
      campaign_count: 234,
      avg_bonus: 5600,
    },
    runner_up: {
      site_name: 'Oley',
      site_code: 'oley',
      campaign_count: 198,
      avg_bonus: 4800,
    },
    total_competitors: 8,
  },
  {
    category: 'bingo',
    winner: {
      site_name: 'Sondüzlük',
      site_code: 'sondzulyuk',
      campaign_count: 156,
      avg_bonus: 4200,
    },
    runner_up: {
      site_name: 'Hipodrom',
      site_code: 'hipodrom',
      campaign_count: 134,
      avg_bonus: 3800,
    },
    total_competitors: 6,
  },
]

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
  }
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
        {/* Winner Row */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500 text-white shadow-sm">
              <Crown className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-sm">{winner.site_name}</p>
              <p className="text-xs text-muted-foreground">
                {winner.campaign_count} kampanya • ₺{winner.avg_bonus.toLocaleString('tr-TR')} ortalama bonus
              </p>
            </div>
          </div>
          <WinnerBadge />
        </div>

        {/* Runner Up Row */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-muted">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted-foreground/20 text-muted-foreground shadow-sm">
              <Trophy className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-sm">{runner_up.site_name}</p>
              <p className="text-xs text-muted-foreground">
                {runner_up.campaign_count} kampanya • ₺{runner_up.avg_bonus.toLocaleString('tr-TR')} ortalama bonus
              </p>
            </div>
          </div>
          <RunnerUpBadge />
        </div>
      </CardContent>
    </Card>
  )
}

export function CategoryWinnerWidget() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5 text-yellow-600" />
        <h2 className="text-lg font-semibold">Kategori Kazananları</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {MOCK_CATEGORY_WINNERS.map((item) => (
          <CategoryWinnerCard
            key={item.category}
            category={item.category}
            winner={item.winner}
            runner_up={item.runner_up}
            total_competitors={item.total_competitors}
          />
        ))}
      </div>
    </div>
  )
}
