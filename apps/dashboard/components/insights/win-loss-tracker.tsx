'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  fetchWinLoss,
  type WinLossData,
  type WinLossEntry,
  type WinLossMetric,
} from '@/lib/api'
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUp,
  ArrowDown,
  Minus,
  Zap,
  Target,
  Coins,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Win/Loss Tracker — Bitalih'in haftalık sıralama değişimi.
 *
 * Veri kaynağı: /api/insights/win-loss (ranking_snapshots, migration 021).
 * Default pencere: bu hafta vs geçen hafta. 3 bölüm:
 *   1. Bitalih Pozisyonu — 4 metric chip (campaign_count, avg_bonus,
 *      category_diversity, momentum) eski → yeni rank.
 *   2. Geçtiklerim (yeşil) — Bitalih'in bu hafta önüne geçtiği site'ler.
 *   3. Beni Geçenler (kırmızı) — Bu hafta Bitalih'in önüne geçen site'ler.
 *
 * Empty state: "Bu hafta sıralama değişikliği yok".
 *
 * Snapshot tablosu boşsa (scraper henüz koşmamış) tüm bölümler boş +
 * empty state göster — kart hata vermesin.
 */

interface MetricMeta {
  label: string
  icon: React.ElementType
  /** Değeri "₺1500" / "12 kategori" gibi göstermek için. */
  formatValue: (v: number) => string
  /** Emoji ikonu — Türkçe kısa chip için. */
  emoji: string
}

const METRIC_META: Record<WinLossMetric, MetricMeta> = {
  campaign_count: {
    label: 'Kampanya',
    icon: Target,
    formatValue: (v) => `${Math.round(v)}`,
    emoji: 'KAMPANYA',
  },
  avg_bonus: {
    label: 'Bonus',
    icon: Coins,
    formatValue: (v) => (v > 0 ? `₺${Math.round(v).toLocaleString('tr-TR')}` : '—'),
    emoji: 'BONUS',
  },
  category_diversity: {
    label: 'Kategori',
    icon: Layers,
    formatValue: (v) => `${Math.round(v)}`,
    emoji: 'KATEGORI',
  },
  momentum: {
    label: 'Momentum',
    icon: Zap,
    formatValue: (v) => `${v >= 0 ? '+' : ''}${Math.round(v)}`,
    emoji: 'MOMENTUM',
  },
}

const METRIC_ORDER: WinLossMetric[] = [
  'campaign_count',
  'avg_bonus',
  'category_diversity',
  'momentum',
]

function rankSuffix(rank: number): string {
  return `${rank}.`
}

export function WinLossTracker() {
  const { data, isLoading } = useQuery({
    queryKey: ['insights', 'win-loss'],
    queryFn: () => fetchWinLoss({}),
    staleTime: 15 * 60 * 1000, // 15dk client cache
  })

  return (
    <Card className="overflow-hidden border-amber-300/40 bg-gradient-to-br from-amber-50/40 via-card to-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500 text-white shadow-sm">
              <Trophy className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold">Win/Loss Tracker</h2>
            <Badge variant="outline" className="text-xs">
              Bu hafta vs geçen hafta
            </Badge>
            {data?.hasData === false && !isLoading && (
              <Badge
                variant="outline"
                className="text-xs border-amber-300 bg-amber-50 text-amber-700"
              >
                Snapshot verisi henüz yok
              </Badge>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Bitalih Pozisyonu — 4 metric chip */}
            <BitalihPositionRow data={data} />

            {/* Wins / Losses */}
            <div className="grid gap-3 md:grid-cols-2">
              <WinLossList
                title="Geçtiklerim"
                emptyText="Bu hafta öne geçtiğin site yok"
                items={data?.wins ?? []}
                tone="positive"
              />
              <WinLossList
                title="Beni Geçenler"
                emptyText="Bu hafta seni geçen site yok"
                items={data?.losses ?? []}
                tone="negative"
              />
            </div>

            {/* Big movers — Bitalih dışı en hareketli site'ler */}
            {data?.bigMovers && data.bigMovers.length > 0 && (
              <BigMoversRow data={data} />
            )}

            {/* Tüm bölümler boş */}
            {data?.hasData &&
              (data?.wins?.length ?? 0) === 0 &&
              (data?.losses?.length ?? 0) === 0 &&
              (data?.bigMovers?.length ?? 0) === 0 && (
                <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                  Bu hafta sıralama değişikliği yok.
                </div>
              )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BitalihPositionRow({ data }: { data: WinLossData | undefined }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold tracking-wider text-muted-foreground">
        BITALIH POZISYONU
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {METRIC_ORDER.map((metric) => {
          const meta = METRIC_META[metric]
          const cur = data?.bitalihPosition?.current?.[metric]
          const prv = data?.bitalihPosition?.previous?.[metric]
          return (
            <PositionChip
              key={metric}
              label={meta.label}
              icon={meta.icon}
              currentRank={cur?.rank}
              previousRank={prv?.rank}
              total={cur?.total ?? prv?.total}
              currentValue={cur ? meta.formatValue(cur.value) : null}
            />
          )
        })}
      </div>
    </div>
  )
}

function PositionChip({
  label,
  icon: Icon,
  currentRank,
  previousRank,
  total,
  currentValue,
}: {
  label: string
  icon: React.ElementType
  currentRank: number | undefined
  previousRank: number | undefined
  total: number | undefined
  currentValue: string | null
}) {
  // Rank delta — düşük sayı daha iyi.
  let direction: 'up' | 'down' | 'flat' | 'unknown' = 'unknown'
  let delta = 0
  if (typeof currentRank === 'number' && typeof previousRank === 'number') {
    delta = previousRank - currentRank
    direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  }

  const dirColor =
    direction === 'up'
      ? 'text-emerald-600'
      : direction === 'down'
      ? 'text-red-600'
      : 'text-muted-foreground'

  const DirIcon =
    direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background/60 p-3">
      <div className="rounded-md bg-amber-100 text-amber-700 p-1.5 shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">
          {label.toUpperCase()}
        </div>
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          {typeof previousRank === 'number' && typeof currentRank === 'number' ? (
            <>
              <span className="text-muted-foreground">{rankSuffix(previousRank)}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-foreground">{rankSuffix(currentRank)}</span>
              {typeof total === 'number' && (
                <span className="text-[11px] text-muted-foreground">/{total}</span>
              )}
            </>
          ) : typeof currentRank === 'number' ? (
            <span className="text-foreground">
              {rankSuffix(currentRank)}
              {typeof total === 'number' && (
                <span className="text-[11px] text-muted-foreground">/{total}</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {direction !== 'unknown' && delta !== 0 && (
            <span className={cn('inline-flex items-center text-[11px]', dirColor)}>
              <DirIcon className="h-3 w-3" />
              {Math.abs(delta)}
            </span>
          )}
        </div>
        {currentValue && (
          <div className="text-[11px] text-muted-foreground">{currentValue}</div>
        )}
      </div>
    </div>
  )
}

function WinLossList({
  title,
  emptyText,
  items,
  tone,
}: {
  title: string
  emptyText: string
  items: WinLossEntry[]
  tone: 'positive' | 'negative'
}) {
  const headerColor =
    tone === 'positive'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
      : 'border-red-300 bg-red-50 text-red-700'
  const HeaderIcon = tone === 'positive' ? TrendingUp : TrendingDown

  return (
    <div
      className={cn(
        'rounded-lg border p-3 space-y-2',
        tone === 'positive'
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-red-200 bg-red-50/40'
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn('rounded-md border p-1', headerColor)}>
          <HeaderIcon className="h-3.5 w-3.5" />
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline" className="ml-auto text-xs">
          {items.length}
        </Badge>
      </div>

      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3 text-center">{emptyText}</div>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 6).map((item, i) => {
            const meta = METRIC_META[item.metric]
            return (
              <li
                key={`${item.siteId}-${item.metric}-${i}`}
                className="flex items-center gap-2 text-xs"
              >
                <span className="font-semibold text-foreground truncate max-w-[40%]">
                  {item.siteName}
                </span>
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <meta.icon className="h-3 w-3" />
                  {meta.label}
                </span>
                <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                  {rankSuffix(item.oldRank)} → {rankSuffix(item.newRank)}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 text-[11px] font-semibold',
                    tone === 'positive' ? 'text-emerald-600' : 'text-red-600'
                  )}
                >
                  {tone === 'positive' ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                  {Math.abs(item.byHowMuch)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function BigMoversRow({ data }: { data: WinLossData }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground">
        <Activity className="h-3 w-3" /> BÜYÜK HAREKET (Bitalih dışı)
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {data.bigMovers.map((m, i) => {
          const meta = METRIC_META[m.metric]
          // delta > 0 → rank büyüdü = düştü (kötü), < 0 → yükseldi (iyi)
          const moverDirection = m.delta < 0 ? 'up' : 'down'
          const Icon = moverDirection === 'up' ? ArrowUp : ArrowDown
          const tone =
            moverDirection === 'up' ? 'text-emerald-600' : 'text-red-600'
          return (
            <div
              key={`${m.siteId}-${m.metric}-${i}`}
              className="flex items-center gap-2 rounded border bg-background/60 px-2 py-1.5 text-xs"
            >
              <span className="font-semibold truncate max-w-[40%]">{m.siteName}</span>
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <meta.icon className="h-3 w-3" />
                {meta.label}
              </span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {rankSuffix(m.oldRank)} → {rankSuffix(m.newRank)}
              </span>
              <span className={cn('inline-flex items-center gap-0.5 text-[11px]', tone)}>
                <Icon className="h-3 w-3" />
                {Math.abs(m.delta)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default WinLossTracker
