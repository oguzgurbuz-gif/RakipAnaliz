'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getSiteColor, compareSitesByPriority } from '@/lib/site-colors'
import { getCategoryLabel } from '@/lib/category-labels'
import { getCampaignBonusInfo } from '@/lib/campaign-presentation'

type Campaign = {
  id: string
  title: string
  site?: { name: string; code: string } | null
  validFrom: string | null
  validTo: string | null
  status: string
  category?: string | null
  metadata?: Record<string, unknown> | null
}

export type GanttChartProps = {
  campaigns: Campaign[]
  /** Inclusive ISO start date for the visible window (YYYY-MM-DD). */
  rangeStart: string
  /** Inclusive ISO end date for the visible window (YYYY-MM-DD). */
  rangeEnd: string
}

const ROW_HEIGHT = 32
const LABEL_WIDTH = 220

function parseLocalIso(iso: string): Date {
  // Anchor at midnight LOCAL — avoids the day-shift bug from `new Date('2026-04-21')`.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function safeDate(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function diffDays(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

function formatTr(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

function daysRemaining(end: Date | null): number | null {
  if (!end) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const e = new Date(end)
  e.setHours(0, 0, 0, 0)
  return diffDays(today, e)
}

type GanttRow = {
  campaign: Campaign
  start: Date
  end: Date
  leftPct: number
  widthPct: number
}

export function GanttChart({ campaigns, rangeStart, rangeEnd }: GanttChartProps) {
  const [openSites, setOpenSites] = useState<Record<string, boolean>>({})

  const view = useMemo(() => {
    const viewStart = parseLocalIso(rangeStart)
    const viewEnd = parseLocalIso(rangeEnd)
    const totalDays = Math.max(1, diffDays(viewStart, viewEnd) + 1)
    return { viewStart, viewEnd, totalDays }
  }, [rangeStart, rangeEnd])

  // Group by site → rows. Skip campaigns fully outside the visible window.
  const groups = useMemo(() => {
    const bySite = new Map<string, { siteName: string; siteCode: string; rows: GanttRow[] }>()

    for (const c of campaigns) {
      const start = safeDate(c.validFrom)
      const end = safeDate(c.validTo)
      if (!start && !end) continue

      // Clamp to the visible window. Open-ended campaigns get clamped at view edges.
      const startClamped = start && start > view.viewStart ? start : view.viewStart
      const endClamped = end && end < view.viewEnd ? end : view.viewEnd

      // Effective range is what we'll plot. Skip if it's outside.
      const effStart = start ?? view.viewStart
      const effEnd = end ?? view.viewEnd
      if (effEnd < view.viewStart || effStart > view.viewEnd) continue

      const leftDays = diffDays(view.viewStart, startClamped)
      const spanDays = Math.max(1, diffDays(startClamped, endClamped) + 1)

      const leftPct = (leftDays / view.totalDays) * 100
      const widthPct = Math.min(100 - leftPct, (spanDays / view.totalDays) * 100)

      const siteCode = c.site?.code ?? 'unknown'
      const siteName = c.site?.name ?? 'Bilinmeyen'
      if (!bySite.has(siteCode)) {
        bySite.set(siteCode, { siteName, siteCode, rows: [] })
      }
      bySite.get(siteCode)!.rows.push({
        campaign: c,
        start: effStart,
        end: effEnd,
        leftPct,
        widthPct: Math.max(1, widthPct),
      })
    }

    // Sort rows inside each group by start date (earliest first) for readability.
    for (const g of bySite.values()) {
      g.rows.sort((a, b) => a.start.getTime() - b.start.getTime())
    }

    // Site grupları: önce öncelikli (bitalih, hipodrom, atyarisi),
    // sonra kalanlar alphabetical. Site CODE üzerinden karşılaştırıyoruz —
    // priority listesi de code-based.
    return Array.from(bySite.values()).sort((a, b) =>
      compareSitesByPriority(a.siteCode, b.siteCode)
    )
  }, [campaigns, view])

  // Month tick marks across the top.
  const monthTicks = useMemo(() => {
    const ticks: Array<{ leftPct: number; label: string }> = []
    const cursor = new Date(view.viewStart)
    cursor.setDate(1)
    if (cursor < view.viewStart) cursor.setMonth(cursor.getMonth() + 1)
    while (cursor <= view.viewEnd) {
      const offsetDays = diffDays(view.viewStart, cursor)
      ticks.push({
        leftPct: (offsetDays / view.totalDays) * 100,
        label: cursor.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }),
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return ticks
  }, [view])

  const todayLeftPct = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (today < view.viewStart || today > view.viewEnd) return null
    return (diffDays(view.viewStart, today) / view.totalDays) * 100
  }, [view])

  const totalRows = groups.reduce((acc, g) => acc + g.rows.length, 0)

  if (totalRows === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        Seçili aralıkta gösterilecek kampanya yok.
      </div>
    )
  }

  return (
    <div className="gantt-chart overflow-x-auto">
      <div className="min-w-[720px]">
        {/* Header row with month ticks */}
        <div className="flex border-b">
          <div
            className="shrink-0 px-2 py-1 text-xs font-medium text-muted-foreground"
            style={{ width: LABEL_WIDTH }}
          >
            Site / Kampanya
          </div>
          <div className="flex-1 relative h-7">
            {monthTicks.map((t, i) => (
              <div
                key={i}
                className="absolute top-0 h-full border-l border-border/60"
                style={{ left: `${t.leftPct}%` }}
              >
                <span className="ml-1 text-[10px] text-muted-foreground capitalize">
                  {t.label}
                </span>
              </div>
            ))}
            {todayLeftPct !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-primary/70"
                style={{ left: `${todayLeftPct}%` }}
                aria-label="Bugün"
              />
            )}
          </div>
        </div>

        <div className="divide-y">
          {groups.map((group) => {
            const isOpen = openSites[group.siteCode] !== false // default open
            const siteColor = getSiteColor(group.siteCode)
            return (
              <div key={group.siteCode}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenSites((prev) => ({
                      ...prev,
                      [group.siteCode]: !isOpen,
                    }))
                  }
                  className="w-full flex items-center gap-2 px-2 py-1.5 bg-muted/40 hover:bg-muted/60 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: siteColor }}
                  />
                  <span className="text-xs font-medium">{group.siteName}</span>
                  <span className="text-[10px] text-muted-foreground">
                    ({group.rows.length} kampanya)
                  </span>
                </button>

                {isOpen &&
                  group.rows.map((row) => {
                    const remaining = daysRemaining(safeDate(row.campaign.validTo))
                    const bonus = getCampaignBonusInfo(row.campaign)
                    return (
                      <div key={row.campaign.id} className="flex items-center">
                        <Link
                          href={`/campaigns/${row.campaign.id}`}
                          className="shrink-0 px-2 py-1 truncate text-xs hover:underline"
                          style={{ width: LABEL_WIDTH }}
                          title={row.campaign.title}
                        >
                          {row.campaign.title}
                        </Link>
                        <div
                          className="flex-1 relative"
                          style={{ height: ROW_HEIGHT }}
                        >
                          {/* Light grid background */}
                          {monthTicks.map((t, i) => (
                            <div
                              key={i}
                              className="absolute top-0 h-full border-l border-border/30"
                              style={{ left: `${t.leftPct}%` }}
                            />
                          ))}
                          {todayLeftPct !== null && (
                            <div
                              className="absolute top-0 bottom-0 w-px bg-primary/70"
                              style={{ left: `${todayLeftPct}%` }}
                            />
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                href={`/campaigns/${row.campaign.id}`}
                                className={cn(
                                  'absolute top-1 bottom-1 rounded-sm flex items-center px-1.5 overflow-hidden',
                                  'shadow-sm hover:opacity-90 transition-opacity'
                                )}
                                style={{
                                  left: `${row.leftPct}%`,
                                  width: `${row.widthPct}%`,
                                  backgroundColor: siteColor,
                                  color: '#fff',
                                }}
                              >
                                <span className="text-[10px] font-medium truncate">
                                  {row.campaign.title}
                                </span>
                                <span className="ml-2 text-[9px] opacity-90 whitespace-nowrap">
                                  {formatTr(row.start)} → {formatTr(row.end)}
                                </span>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <div className="font-medium text-sm mb-1">
                                {row.campaign.title}
                              </div>
                              <div className="text-xs space-y-0.5">
                                <div>
                                  <span className="text-muted-foreground">Site: </span>
                                  {group.siteName}
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Kategori: </span>
                                  {getCategoryLabel(row.campaign.category)}
                                </div>
                                {bonus.display && (
                                  <div>
                                    <span className="text-muted-foreground">Bonus: </span>
                                    {bonus.display}
                                  </div>
                                )}
                                <div>
                                  <span className="text-muted-foreground">Tarih: </span>
                                  {formatTr(row.start)} – {formatTr(row.end)}
                                </div>
                                {remaining !== null && remaining >= 0 && (
                                  <div>
                                    <span className="text-muted-foreground">Kalan gün: </span>
                                    {remaining}
                                  </div>
                                )}
                                {remaining !== null && remaining < 0 && (
                                  <div className="text-rose-500">Süresi dolmuş</div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Toplam {totalRows} kampanya, {groups.length} site
        </p>
      </div>
    </div>
  )
}
