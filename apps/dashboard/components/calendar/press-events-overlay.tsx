'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchPressEventYoY,
  type PressEvent,
  type PressEventType,
  type PressEventYoY,
} from '@/lib/api'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { getSiteDisplayName } from '@/lib/i18n/site'

/**
 * Press / event calendar overlay primitives.
 *
 * - PRESS_EVENT_COLORS / PRESS_EVENT_ICONS: type → renk + emoji haritası.
 * - getPressEventsForDay(): bir günün üzerine düşen event'leri filtreler.
 * - PressEventBadge: takvim hücrelerinde küçük renkli pill.
 * - PressEventDetailModal: hover/click sonrası açılan YoY popover.
 *
 * Mevcut takvim grid'ine non-invasive eklenmek üzere tasarlandı; sayfa
 * componentı sadece bu helpers'ı çağırır.
 */

export const PRESS_EVENT_COLORS: Record<PressEventType, string> = {
  religious: '#a855f7', // purple-500
  sports: '#3b82f6', // blue-500
  national: '#ef4444', // red-500
  commercial: '#f97316', // orange-500
  other: '#737373', // neutral-500
}

export const PRESS_EVENT_ICONS: Record<PressEventType, string> = {
  religious: '🌙',
  sports: '⚽',
  national: '🇹🇷',
  commercial: '🛒',
  other: '📅',
}

export const PRESS_EVENT_LABELS: Record<PressEventType, string> = {
  religious: 'Dini',
  sports: 'Spor',
  national: 'Ulusal',
  commercial: 'Ticari',
  other: 'Diğer',
}

/**
 * Bir günün üstüne düşen event'leri döndürür. Event'in [start, end] aralığı
 * verilen güne dahilse `event` listede yer alır.
 */
export function getPressEventsForDay(
  events: PressEvent[],
  year: number,
  month: number, // 0-indexed
  day: number
): PressEvent[] {
  const target = new Date(year, month, day)
  const targetMs = target.getTime()
  return events.filter((e) => {
    const [sy, sm, sd] = e.start_date.split('-').map((v) => parseInt(v, 10))
    const [ey, em, ed] = e.end_date.split('-').map((v) => parseInt(v, 10))
    if ([sy, sm, sd, ey, em, ed].some((n) => Number.isNaN(n))) return false
    const start = new Date(sy, sm - 1, sd).getTime()
    const end = new Date(ey, em - 1, ed).getTime()
    return targetMs >= start && targetMs <= end
  })
}

interface PressEventBadgeProps {
  event: PressEvent
  onClick?: () => void
  compact?: boolean
}

export function PressEventBadge({
  event,
  onClick,
  compact = false,
}: PressEventBadgeProps) {
  const color = PRESS_EVENT_COLORS[event.event_type]
  const icon = PRESS_EVENT_ICONS[event.event_type]
  const shortName = event.name.length > 18 ? event.name.slice(0, 16) + '…' : event.name

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${event.name} (${event.description ?? ''})`}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight truncate w-full text-left transition-opacity hover:opacity-80',
        compact && 'text-[9px] px-0.5'
      )}
      style={{
        backgroundColor: `${color}22`,
        borderLeft: `2px solid ${color}`,
        color: 'inherit',
      }}
    >
      <span>{icon}</span>
      <span className="truncate">{shortName}</span>
    </button>
  )
}

/**
 * Compact legend for the press event color/icon system. Shown next to the
 * site color legend in the calendar page.
 */
export function PressEventLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {(Object.keys(PRESS_EVENT_COLORS) as PressEventType[]).map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded border bg-card"
        >
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: PRESS_EVENT_COLORS[t] }}
          />
          {PRESS_EVENT_ICONS[t]} {PRESS_EVENT_LABELS[t]}
        </span>
      ))}
    </div>
  )
}

interface PressEventDetailModalProps {
  event: PressEvent | null
  onClose: () => void
}

export function PressEventDetailModal({
  event,
  onClose,
}: PressEventDetailModalProps) {
  const isOpen = event !== null

  // YoY query — yalnızca modal açıkken tetiklenir.
  const { data: yoy, isLoading } = useQuery<PressEventYoY | null>({
    queryKey: ['press-event-yoy', event?.id],
    queryFn: () => (event ? fetchPressEventYoY(event.id) : Promise.resolve(null)),
    enabled: isOpen,
    staleTime: 60_000,
  })

  if (!event) return null

  const color = PRESS_EVENT_COLORS[event.event_type]
  const icon = PRESS_EVENT_ICONS[event.event_type]

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl">
      <div className="space-y-4">
        <header className="flex items-start gap-3 border-b pb-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-md text-xl"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold leading-tight">{event.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span
                className="inline-flex items-center rounded px-1.5 py-0.5 font-medium"
                style={{ backgroundColor: `${color}22`, color }}
              >
                {PRESS_EVENT_LABELS[event.event_type]}
              </span>
              <span>
                {event.start_date}
                {event.end_date !== event.start_date && ` → ${event.end_date}`}
              </span>
              <span>•</span>
              <span>İzleme önceliği: {event.impact_score}/10</span>
            </div>
          </div>
        </header>

        {event.description && (
          <p className="text-sm text-muted-foreground">{event.description}</p>
        )}

        <section>
          <h3 className="text-sm font-semibold mb-2">
            Geçen yıl bu eventte rakipler ne yaptı?
          </h3>
          {isLoading && (
            <div className="text-xs text-muted-foreground py-4 text-center">
              YoY verisi yükleniyor…
            </div>
          )}
          {!isLoading && yoy && (
            <div className="grid gap-3 md:grid-cols-2">
              <YoYCard title="Bu Yıl" window={yoy.thisYear} accent={color} />
              <YoYCard title="Geçen Yıl" window={yoy.lastYear} accent="#737373" />
            </div>
          )}
          {!isLoading && !yoy && (
            <div className="text-xs text-muted-foreground py-4 text-center">
              YoY verisi alınamadı.
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}

function YoYCard({
  title,
  window: w,
  accent,
}: {
  title: string
  window: PressEventYoY['thisYear']
  accent: string
}) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-medium" style={{ color: accent }}>
          {title}
        </h4>
        <span className="text-[10px] text-muted-foreground">
          {w.from} → {w.to}
        </span>
      </div>
      <div>
        <div className="text-2xl font-bold">{w.campaignCount}</div>
        <div className="text-xs text-muted-foreground">başlatılan kampanya</div>
      </div>

      {w.topCategories.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Top kategoriler
          </div>
          <div className="flex flex-wrap gap-1">
            {w.topCategories.map((c) => (
              <span
                key={c.category}
                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]"
              >
                <span className="font-medium">{c.category}</span>
                <span className="text-muted-foreground">{c.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {w.topBonuses.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            En yüksek bonuslar
          </div>
          <ul className="space-y-1">
            {w.topBonuses.map((b) => (
              <li key={b.campaign_id} className="text-[11px] flex items-baseline gap-2">
                <span className="font-mono text-muted-foreground">
                  {getSiteDisplayName(b.site_code, undefined) || '?'}
                </span>
                <span className="flex-1 truncate">{b.title}</span>
                <span className="font-semibold">
                  {b.bonus_amount?.toLocaleString('tr-TR') ?? '-'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {w.topBonuses.length === 0 && w.topCategories.length === 0 && (
        <div className="text-[11px] text-muted-foreground italic">
          Bu pencerede kampanya kaydı yok.
        </div>
      )}
    </div>
  )
}
