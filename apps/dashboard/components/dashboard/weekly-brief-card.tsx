'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { fetchWeeklyBrief } from '@/lib/api'
import { TrendingUp, AlertTriangle, Zap, RefreshCw, Sparkles, CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Hafta Özeti Brief Card — dashboard üstü prescriptive AI kartı.
 *
 * Veri /api/insights/weekly-brief'ten gelir; cache server tarafında 1 saat.
 * "Yenile" butonu `?force=1` ile cache'i atlatıp yeni brief üretir.
 *
 * AI down/unavailable ise fallback mesajlar gösterilir; bu durumda
 * `aiAvailable=false` flag'i ile kullanıcıya açık şekilde belirtilir.
 */
export function WeeklyBriefCard() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['insights', 'weekly-brief'],
    queryFn: () => fetchWeeklyBrief(false),
    staleTime: 60 * 60 * 1000, // 1h client-side
  })

  const handleRefresh = async () => {
    // force=1 ile server cache atlatılır
    const fresh = await fetchWeeklyBrief(true)
    // tanstack-query'ye direkt set
    await refetch()
    return fresh
  }

  const formatDate = (iso: string): string => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
  }

  return (
    <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-violet-500/5 via-card to-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-violet-500 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold">Hafta Özeti</h2>
            {data?.dateFrom && data?.dateTo && (
              <Badge variant="outline" className="gap-1 ml-1 text-xs">
                <CalendarRange className="h-3 w-3" />
                {formatDate(data.dateFrom)} – {formatDate(data.dateTo)}
              </Badge>
            )}
            {data && !data.aiAvailable && (
              <Badge
                variant="outline"
                className="text-xs border-amber-300 bg-amber-50 text-amber-700"
              >
                AI özeti şu an mevcut değil
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="gap-1 text-xs"
            title="Yeni brief üret"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Yenile
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="space-y-3">
            <BriefRow
              icon={TrendingUp}
              colorClass="text-blue-600 bg-blue-50 border-blue-200"
              label="TOP DEĞİŞİKLİK"
              text={data?.topChange ?? '—'}
            />
            <BriefRow
              icon={AlertTriangle}
              colorClass="text-orange-600 bg-orange-50 border-orange-200"
              label="RİSK"
              text={data?.risk ?? '—'}
            />
            <BriefRow
              icon={Zap}
              colorClass="text-emerald-600 bg-emerald-50 border-emerald-200"
              label="AKSIYON"
              text={data?.action ?? '—'}
            />
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {data?.aiAvailable !== false
              ? 'AI ile üretildi (DeepSeek)'
              : 'Heuristik fallback — AI servisi normale dönünce kart yenilenir'}
          </span>
          {data?.generatedAt && (
            <span>
              Üretildi: {new Date(data.generatedAt).toLocaleString('tr-TR')}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function BriefRow({
  icon: Icon,
  colorClass,
  label,
  text,
}: {
  icon: React.ElementType
  colorClass: string
  label: string
  text: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-background/60 p-3">
      <div className={cn('rounded-md border p-1.5 shrink-0', colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="space-y-0.5 min-w-0">
        <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-sm leading-snug text-foreground">{text}</div>
      </div>
    </div>
  )
}

export default WeeklyBriefCard
