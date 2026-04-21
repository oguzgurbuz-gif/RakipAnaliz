'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { fetchCalendarOverlaps, type CalendarOverlap } from '@/lib/api'
import { getSiteColor, getSiteColorEntries } from '@/lib/site-colors'
import { getCategoryLabel } from '@/lib/category-labels'

type OverlapHeatmapProps = {
  /** YYYY-MM-DD inclusive */
  rangeStart: string
  /** YYYY-MM-DD inclusive */
  rangeEnd: string
}

function eachDay(start: string, end: string): string[] {
  const days: string[] = []
  const [ys, ms, ds] = start.split('-').map(Number)
  const [ye, me, de] = end.split('-').map(Number)
  const cursor = new Date(ys, (ms || 1) - 1, ds || 1)
  const endDate = new Date(ye, (me || 1) - 1, de || 1)
  while (cursor <= endDate) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    days.push(`${y}-${m}-${d}`)
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

/** Cell intensity: maps overlap count → tailwind-friendly bg with opacity. */
function cellShade(count: number): string {
  if (count >= 5) return 'bg-rose-600/90'
  if (count >= 4) return 'bg-rose-500/80'
  if (count >= 3) return 'bg-orange-500/80'
  if (count >= 2) return 'bg-amber-400/80'
  return 'bg-muted/30'
}

export function OverlapHeatmap({ rangeStart, rangeEnd }: OverlapHeatmapProps) {
  const { data, isLoading, isError } = useQuery<CalendarOverlap[]>({
    queryKey: ['calendar-overlaps', rangeStart, rangeEnd],
    queryFn: () => fetchCalendarOverlaps(rangeStart, rangeEnd),
  })

  const overlaps = data ?? []

  // Build a (date, siteCode) → { count, categories } index for O(1) lookup.
  const grid = useMemo(() => {
    const map = new Map<
      string,
      Map<string, { count: number; categories: Set<string>; allSites: Set<string> }>
    >()
    for (const o of overlaps) {
      if (!map.has(o.date)) map.set(o.date, new Map())
      const dayMap = map.get(o.date)!
      for (const site of o.sites) {
        if (!dayMap.has(site)) {
          dayMap.set(site, { count: 0, categories: new Set(), allSites: new Set() })
        }
        const cell = dayMap.get(site)!
        cell.count += 1
        cell.categories.add(o.category)
        for (const s of o.sites) cell.allSites.add(s)
      }
    }
    return map
  }, [overlaps])

  const days = useMemo(() => eachDay(rangeStart, rangeEnd), [rangeStart, rangeEnd])
  const sites = useMemo(() => getSiteColorEntries(), [])

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-4">Çakışma verileri yükleniyor...</div>
    )
  }
  if (isError) {
    return (
      <div className="text-sm text-rose-500 py-4">Çakışma verileri alınamadı.</div>
    )
  }

  const totalCollisions = overlaps.length

  if (totalCollisions === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        Bu aralıkta farklı siteler arasında aynı gün + kategoride çakışan kampanya yok.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {totalCollisions} çakışma noktası • {days.length} gün • {sites.length} site.
        Her hücre, ilgili sitenin o günde başka bir sitenin aynı kategorideki kampanyasıyla çakışmasını gösterir.
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Header: dates */}
          <div className="flex">
            <div className="w-28 shrink-0" />
            {days.map((d) => {
              const dayNum = d.slice(8, 10)
              const showMonth = dayNum === '01'
              return (
                <div
                  key={d}
                  className="w-4 shrink-0 text-[8px] text-center text-muted-foreground"
                  title={d}
                >
                  {showMonth ? d.slice(5, 7) : ''}
                </div>
              )
            })}
          </div>

          {/* Per-site rows */}
          {sites.map(({ code, color }) => (
            <div key={code} className="flex items-center">
              <div className="w-28 shrink-0 flex items-center gap-2 pr-2 py-0.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] truncate">{code}</span>
              </div>
              {days.map((d) => {
                const cell = grid.get(d)?.get(code)
                const count = cell?.count ?? 0
                const cls = cellShade(count)
                return (
                  <Tooltip key={`${code}-${d}`}>
                    <TooltipTrigger asChild>
                      <div
                        className={`w-4 h-4 shrink-0 border border-border/30 ${cls} cursor-default`}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="font-medium text-xs">{d}</div>
                      <div className="text-[11px] text-muted-foreground">{code}</div>
                      {count === 0 ? (
                        <div className="text-[11px]">Çakışma yok</div>
                      ) : (
                        <>
                          <div className="text-[11px] mt-1">
                            <span className="text-muted-foreground">Çakışma: </span>
                            {count}
                          </div>
                          <div className="text-[11px]">
                            <span className="text-muted-foreground">Kategoriler: </span>
                            {Array.from(cell!.categories)
                              .map((c) => getCategoryLabel(c))
                              .join(', ')}
                          </div>
                          <div className="text-[11px]">
                            <span className="text-muted-foreground">Diğer siteler: </span>
                            {Array.from(cell!.allSites)
                              .filter((s) => s !== code)
                              .join(', ') || '—'}
                          </div>
                        </>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Intensity legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span>Yoğunluk:</span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 inline-block bg-amber-400/80" /> 2
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 inline-block bg-orange-500/80" /> 3
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 inline-block bg-rose-500/80" /> 4
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 inline-block bg-rose-600/90" /> 5+
        </span>
      </div>
    </div>
  )
}
