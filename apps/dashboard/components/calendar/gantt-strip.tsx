'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type Campaign = {
  id: string
  title: string
  site?: { name: string; code: string } | null
  validFrom: string | null
  validTo: string | null
  status: string
  category?: string | null
  sentiment?: string | null
}

function isValidDate(date: string | null | undefined): boolean {
  return !!date && !isNaN(new Date(date).getTime())
}

function getLocalDateParts(dateStr: string | null): { year: number; month: number; day: number } | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
  }
}

type GanttStripProps = {
  campaigns: Campaign[]
  year: number
  viewType: '3-month' | '6-month' | '12-month'
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('tr-TR', { month: 'short' })

export function GanttStrip({ campaigns, year, viewType }: GanttStripProps) {
  const monthCount = viewType === '3-month' ? 3 : viewType === '6-month' ? 6 : 12
  const startMonth = viewType === '12-month' ? 0 : viewType === '6-month' ? 6 : 9

  const months = useMemo(() => {
    return Array.from({ length: monthCount }).map((_, i) => {
      const monthIndex = (startMonth + i) % 12
      const displayYear = startMonth + i >= 12 ? year + 1 : year
      return {
        month: monthIndex,
        year: displayYear,
        label: MONTH_LABEL_FORMATTER.format(new Date(displayYear, monthIndex, 1)),
      }
    })
  }, [monthCount, startMonth, year])

  const getBarStyle = (campaign: Campaign) => {
    const startParts = getLocalDateParts(campaign.validFrom)
    const endParts = getLocalDateParts(campaign.validTo)
    
    if (!startParts && !endParts) return null

    const startDate = startParts ? new Date(startParts.year, startParts.month, startParts.day) : new Date(year, 0, 1)
    const endDate = endParts ? new Date(endParts.year, endParts.month, endParts.day) : new Date(year, 11, 31)

    const viewStart = new Date(year, startMonth, 1)
    const viewEnd = new Date(months[months.length - 1].year, months[months.length - 1].month + 1, 0)

    if (endDate < viewStart || startDate > viewEnd) return null

    const totalDays = (viewEnd.getTime() - viewStart.getTime()) / (1000 * 60 * 60 * 24)
    const startOffset = Math.max(0, (startDate.getTime() - viewStart.getTime()) / (1000 * 60 * 60 * 24))
    const endOffset = Math.min(totalDays, (endDate.getTime() - viewStart.getTime()) / (1000 * 60 * 60 * 24))

    const left = (startOffset / totalDays) * 100
    const width = Math.max(2, ((endOffset - startOffset) / totalDays) * 100)

    return { left: `${left}%`, width: `${width}%` }
  }

  const getBarColor = (status: string) => {
    // Wave 1 #1.4 — Kanonik 4 state (active/expired/hidden/pending). Eski
    // legacy 'ended' / 'passive' inputlarını da kabul ediyoruz; aynı renge map.
    switch (status) {
      case 'active':
        return 'bg-emerald-500'
      case 'expired':
      case 'ended':
        return 'bg-slate-400'
      case 'hidden':
      case 'passive':
        return 'bg-amber-300'
      case 'pending':
        return 'bg-amber-400'
      default:
        return 'bg-gray-400'
    }
  }

  const visibleCampaigns = campaigns.filter(c => {
    const startParts = getLocalDateParts(c.validFrom)
    const endParts = getLocalDateParts(c.validTo)
    if (!startParts && !endParts) return false
    
    const startDate = startParts ? new Date(startParts.year, startParts.month, startParts.day) : new Date(year - 1, 0, 1)
    const endDate = endParts ? new Date(endParts.year, endParts.month, endParts.day) : new Date(year + 1, 11, 31)
    const viewStart = new Date(year, startMonth, 1)
    const viewEnd = new Date(months[months.length - 1].year, months[months.length - 1].month + 1, 0)
    
    return endDate >= viewStart && startDate <= viewEnd
  })

  return (
    <div className="gantt-strip overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Month headers */}
        <div className="flex border-b">
          <div className="w-48 shrink-0 text-xs font-medium text-muted-foreground px-2 py-1">Kampanya</div>
          <div className="flex-1 flex">
            {months.map((m, i) => (
              <div 
                key={`${m.year}-${m.month}`} 
                className={cn(
                  'flex-1 text-xs text-center text-muted-foreground border-l py-1',
                  i === months.length - 1 && 'border-r'
                )}
              >
                {m.label} {m.year}
              </div>
            ))}
          </div>
        </div>

        {/* Campaign bars */}
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {visibleCampaigns.slice(0, 100).map((campaign) => {
            const barStyle = getBarStyle(campaign)
            if (!barStyle) return null

            return (
              <div key={campaign.id} className="flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-48 shrink-0 truncate text-xs px-2 py-1 hover:bg-muted/50 cursor-default">
                      {campaign.site?.name || '?'} - {campaign.title.substring(0, 25)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="font-medium">{campaign.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {campaign.validFrom && new Date(campaign.validFrom).toLocaleDateString('tr-TR')} - {' '}
                      {campaign.validTo && new Date(campaign.validTo).toLocaleDateString('tr-TR')}
                    </div>
                    <div className="text-xs capitalize mt-1">
                      Durum: {campaign.status}
                    </div>
                  </TooltipContent>
                </Tooltip>
                <div className="flex-1 relative h-6">
                  {/* Grid background */}
                  <div className="absolute inset-0 flex">
                    {months.map((m, i) => (
                      <div 
                        key={`grid-${m.year}-${m.month}`} 
                        className={cn(
                          'flex-1 border-l border-border/30',
                          i === months.length - 1 && 'border-r'
                        )}
                      />
                    ))}
                  </div>
                  {/* Campaign bar */}
                  <div
                    className={cn(
                      'absolute h-4 top-1 rounded-sm transition-opacity hover:opacity-100',
                      getBarColor(campaign.status),
                      'opacity-80'
                    )}
                    style={barStyle}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          {visibleCampaigns.length > 100 
            ? `İlk 100 kampanya gösteriliyor (toplam ${visibleCampaigns.length})`
            : `${visibleCampaigns.length} kampanya gösteriliyor`}
        </p>
      </div>
    </div>
  )
}
