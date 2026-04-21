'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertTriangle } from 'lucide-react'

type Campaign = {
  id: string
  title: string
  site?: { name: string; code: string } | null
  validFrom: string | null
  validTo: string | null
  status: string
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

type OverlapDay = {
  date: Date
  count: number
  campaigns: Campaign[]
}

type OverlapDetectorProps = {
  campaigns: Campaign[]
  year: number
  month: number
}

export function OverlapDetector({ campaigns, year, month }: OverlapDetectorProps) {
  const overlapDays = useMemo(() => {
    const days: OverlapDay[] = []
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    for (let d = 1; d <= daysInMonth; d++) {
      const checkDate = new Date(year, month, d)
      const dayCampaigns = campaigns.filter(c => {
        const fromParts = getLocalDateParts(c.validFrom)
        const toParts = c.validTo ? getLocalDateParts(c.validTo) : null

        if (!fromParts && !toParts) return false

        const fromDate = fromParts ? new Date(fromParts.year, fromParts.month, fromParts.day) : new Date(year - 1, 0, 1)
        const toDate = toParts ? new Date(toParts.year, toParts.month, toParts.day) : new Date(year + 1, 11, 31)

        return checkDate >= fromDate && checkDate <= toDate
      })

      if (dayCampaigns.length >= 3) {
        days.push({ date: checkDate, count: dayCampaigns.length, campaigns: dayCampaigns })
      }
    }

    return days
  }, [campaigns, year, month])

  if (overlapDays.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        Bu ayda 3+ kampanya çakışması yok
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-600">
        <AlertTriangle className="h-4 w-4" />
        <span>{overlapDays.length} günde çakışma tespit edildi</span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {overlapDays.map((day) => (
          <Tooltip key={day.date.toISOString()}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md cursor-help">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <div>
                  <div className="text-xs font-medium">
                    {day.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  </div>
                  <div className="text-xs text-amber-600">
                    {day.count} kampanya
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <div className="font-medium text-sm mb-1">
                {day.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                {day.count} kampanya çakışıyor
              </div>
              <div className="space-y-1">
                {day.campaigns.slice(0, 5).map((c) => (
                  <div key={c.id} className="text-xs truncate">
                    • {c.title}
                  </div>
                ))}
                {day.campaigns.length > 5 && (
                  <div className="text-xs text-muted-foreground">
                    +{day.campaigns.length - 5} daha...
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

// Inline overlap badge for calendar cells
type OverlapBadgeProps = {
  count: number
  className?: string
}

export function OverlapBadge({ count, className }: OverlapBadgeProps) {
  if (count < 3) return null

  const variant = count >= 5 ? 'destructive' : count >= 4 ? 'warning' : 'default'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'inline-flex items-center justify-center rounded-full text-xs font-bold px-1.5 py-0.5',
            variant === 'destructive' && 'bg-red-500 text-white',
            variant === 'warning' && 'bg-orange-500 text-white',
            variant === 'default' && 'bg-amber-500 text-white',
            className
          )}
        >
          {count}+
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span className="text-xs">{count} kampanya çakışıyor</span>
      </TooltipContent>
    </Tooltip>
  )
}

// Overlap counter for each day
export function getOverlapCount(campaigns: Campaign[], date: Date): number {
  return campaigns.filter(c => {
    const fromParts = getLocalDateParts(c.validFrom)
    const toParts = c.validTo ? getLocalDateParts(c.validTo) : null

    if (!fromParts && !toParts) return false

    const fromDate = fromParts ? new Date(fromParts.year, fromParts.month, fromParts.day) : new Date(date.getFullYear() - 1, 0, 1)
    const toDate = toParts ? new Date(toParts.year, toParts.month, toParts.day) : new Date(date.getFullYear() + 1, 11, 31)

    return date >= fromDate && date <= toDate
  }).length
}
