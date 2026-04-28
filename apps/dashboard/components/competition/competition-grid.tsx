'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StanceBadge, formatStanceTooltip } from '@/components/ui/stance-badge'
import { formatCurrency, formatNumber } from '@/lib/format/currency'
import { getSiteDisplayName } from '@/lib/i18n/site'
import { METRIC_TOOLTIPS } from '@/lib/i18n/metric-tooltips'

type MomentumDirection = 'up' | 'down' | 'stable'

// Momentum is recalculated daily by the scraper. If the snapshot is older
// than this threshold the dashboard surfaces a "stale" warning so users
// know the score may not reflect today's reality.
const STALE_DAYS = 2
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000

function isMomentumStale(updatedAt: string | Date | null | undefined): boolean {
  if (!updatedAt) return true
  const ts = typeof updatedAt === 'string' ? Date.parse(updatedAt) : updatedAt.getTime()
  if (Number.isNaN(ts)) return true
  return Date.now() - ts > STALE_MS
}

interface SiteCardProps {
  site: {
    site_id: string
    site_name: string
    site_code: string
    total_campaigns: number
    active_campaigns: number
    avg_bonus: number
    total_bonus: number
    categories_count: number
    active_rate: number
    momentum_score: number
    momentum_direction: MomentumDirection
    momentum_updated_at?: string | Date | null
    // Migration 020 — Atak/Defans (additive). API her zaman 'unknown' fallback'i
    // ile döner; eski tüketiciler opsiyonel olarak okur.
    stance?: 'aggressive' | 'neutral' | 'defensive' | 'unknown'
    stance_velocity_delta?: number
    stance_score?: number | null
    stance_updated_at?: string | Date | null
  }
  rank?: number
}

const momentumConfig = {
  up: {
    icon: TrendingUp,
    label: 'Yükseliş',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    dotColor: 'bg-green-500',
  },
  down: {
    icon: TrendingDown,
    label: 'Düşüş',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    dotColor: 'bg-red-500',
  },
  stable: {
    icon: Minus,
    label: 'Stabil',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    dotColor: 'bg-gray-500',
  },
}

export function MomentumBadge({ direction, score }: { direction: MomentumDirection; score: number }) {
  const config = momentumConfig[direction]
  const Icon = config.icon

  return (
    <div
      // FE-9: % momentum_score → "neyin yüzdesi" tooltip (cursor-help).
      title={METRIC_TOOLTIPS['site.momentum_score']}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium cursor-help',
        config.bgColor,
        config.color
      )}
    >
      <span className={cn('w-2 h-2 rounded-full', config.dotColor)} />
      <Icon className="w-3 h-3" />
      <span>{config.label}</span>
      {score !== 0 && (
        <span className="opacity-70 ml-0.5">
          {score > 0 ? '+' : ''}{score}%
        </span>
      )}
    </div>
  )
}

/**
 * Small warning badge surfaced next to MomentumBadge when the underlying
 * momentum snapshot has not been refreshed in the last STALE_DAYS days.
 * Backed by the scraper's daily momentum-recalc job.
 */
export function MomentumStaleBadge({ updatedAt }: { updatedAt?: string | Date | null }) {
  if (!isMomentumStale(updatedAt)) return null

  const tooltip = updatedAt
    ? `Momentum verisi ${STALE_DAYS}+ gün önce güncellendi (${new Date(updatedAt).toLocaleString('tr-TR')})`
    : `Momentum verisi henüz hesaplanmadı`

  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 border border-orange-200"
    >
      <AlertTriangle className="w-3 h-3" />
      <span>stale</span>
    </span>
  )
}

export function SiteCard({ site, rank }: SiteCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {rank && (
              <span className={cn(
                'text-lg font-bold w-7 h-7 flex items-center justify-center rounded-full',
                rank === 1 && 'bg-yellow-100 text-yellow-700',
                rank === 2 && 'bg-gray-100 text-gray-600',
                rank === 3 && 'bg-orange-100 text-orange-700',
                rank > 3 && 'bg-muted text-muted-foreground'
              )}>
                {rank}
              </span>
            )}
            <div>
              {/* FE-8: Site adı merkezi `getSiteDisplayName` ile —
                  payload'da `name` yoksa code → Title Case. */}
              <CardTitle className="text-base">
                {getSiteDisplayName(site.site_code, site.site_name)}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{site.site_code}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 justify-end">
            <MomentumBadge
              direction={site.momentum_direction}
              score={site.momentum_score}
            />
            <MomentumStaleBadge updatedAt={site.momentum_updated_at} />
            {/* Migration 020 — Atak/Defans tutum chip'i. API 'unknown'
                fallback'i ile döner; o durumda da soluk gri chip görünür. */}
            <StanceBadge
              stance={site.stance}
              velocityDelta={site.stance_velocity_delta}
              tooltip={formatStanceTooltip({
                stance: site.stance,
                velocityDelta: site.stance_velocity_delta,
                stanceScore: site.stance_score,
                updatedAt: site.stance_updated_at,
              })}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Toplam Kampanya</p>
            <p className="text-lg font-semibold">{formatNumber(Number(site.total_campaigns))}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Aktif</p>
            <p className="text-lg font-semibold text-green-600">
              {formatNumber(Number(site.active_campaigns))}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Ort. Bonus</p>
            {/* FE-8: ₺ format'ı merkezi formatter — locale ve yuvarlama tutarlı. */}
            <p className="text-sm font-mono font-semibold">{formatCurrency(Number(site.avg_bonus))}</p>
          </div>
          <div>
            {/* FE-9: % "Aktif %" → metric-tooltips map'inden context. */}
            <p
              className="text-xs text-muted-foreground cursor-help"
              title={METRIC_TOOLTIPS['site.active_rate']}
            >
              Aktif %
            </p>
            <p className="text-sm font-semibold">
              {(Number(site.active_rate) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
        
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {site.categories_count} farklı türde kampanya
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

interface CompetitionGridProps {
  sites: SiteCardProps['site'][]
  isLoading?: boolean
}

export function CompetitionGrid({ sites, isLoading }: CompetitionGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-40 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (sites.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Henüz rekabet verisi bulunamadı.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sites.map((site, index) => (
        <SiteCard key={site.site_id} site={site} rank={index + 1} />
      ))}
    </div>
  )
}

export default CompetitionGrid
