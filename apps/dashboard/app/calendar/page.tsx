'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as Tabs from '@radix-ui/react-tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { PageHeader } from '@/components/ui/page-header'
import { useSSE } from '@/lib/sse'
import { fetchCampaigns, fetchPressEvents, type PressEvent } from '@/lib/api'
import { getCategoryLabel } from '@/lib/category-labels'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  Download,
} from 'lucide-react'
import Link from 'next/link'
import { GanttStrip } from '@/components/calendar/gantt-strip'
import { GanttChart } from '@/components/calendar/gantt-chart'
import { OverlapBadge } from '@/components/calendar/overlap-detector'
import { OverlapHeatmap } from '@/components/calendar/overlap-heatmap'
import {
  PressEventBadge,
  PressEventDetailModal,
  PressEventLegend,
  getPressEventsForDay,
} from '@/components/calendar/press-events-overlay'
import { getSiteColor, getSiteColorEntries } from '@/lib/site-colors'
import { buildCampaignsIcs, downloadIcs } from '@/lib/ics-export'
import { DateRangePickerHeader } from '@/components/ui/date-range-picker-header'
import { useDateRange } from '@/lib/date-range/context'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { BonusChips } from '@/components/ui/bonus-chips'

type Campaign = {
  id: string
  title: string
  site?: { name: string; code: string } | null
  validFrom: string | null
  validTo: string | null
  status: string
  category?: string | null
  sentiment?: string | null
  aiSentiment?: string | null
  metadata?: Record<string, unknown> | null
}

type CampaignResponse = {
  data: Campaign[]
  total: number
}

// Wave 1 #1.4 — Kanonik 4 state (StatusBadge / scraper schema ile uyumlu).
// Legacy 'ended'/'passive' artık dropdown'da gösterilmez; backend bu değerlerle
// satır kaydetmiyor.
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Tüm durumlar' },
  { value: 'active', label: 'Aktif' },
  { value: 'expired', label: 'Bitmiş' },
  { value: 'hidden', label: 'Pasif' },
  { value: 'pending', label: 'Beklemede' },
]

// Aligned with category-labels.ts. We expose the most common ones so the
// dropdown stays manageable; rare codes are still filterable via the search box.
const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Tüm kategoriler' },
  { value: 'hoş-geldin-bonusu', label: 'Hoş Geldin Bonusu' },
  { value: 'depozit-bonusu', label: 'Depozit Bonusu' },
  { value: 'freebet', label: 'Freebet' },
  { value: 'cashback', label: 'Cashback' },
  { value: 'oran-artışı', label: 'Oran Artışı' },
  { value: 'çekiliş-lottery', label: 'Çekiliş / Lottery' },
  { value: 'sadakat-vip', label: 'Sadakat / VIP' },
  { value: 'turnuva-yarışma', label: 'Turnuva / Yarışma' },
  { value: 'spor-bonus', label: 'Spor Bonusu' },
  { value: 'casino-bonus', label: 'Casino Bonusu' },
  { value: 'genel-promosyon', label: 'Genel Promosyon' },
]

function getLocalDateParts(
  dateStr: string | null
): { year: number; month: number; day: number } | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
  }
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

export default function CalendarPage() {
  // Global tarih aralığı — sayfanın tüm view'leri (Aylık + Gantt) bu range'i
  // kullanır. Cookie + URL ile persist edilir, scope-spesifik default 'thisMonth'.
  const { from: dateFrom, to: dateTo, setRange } = useDateRange('calendar')

  // View ve Gantt strip yoğunluğu URL'de persist — paylaşılan link'ler aynı
  // görünümü açsın, geri tuşu state sıçratmasın. Default'lar: view=month,
  // strip=6-month. URL'de geçersiz değer varsa default'a fallback.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const view: 'month' | 'gantt' = searchParams?.get('view') === 'gantt' ? 'gantt' : 'month'
  const stripParam = searchParams?.get('strip')
  const viewType: '3-month' | '6-month' | '12-month' =
    stripParam === '3-month' || stripParam === '12-month' ? stripParam : '6-month'

  const updateQueryParam = useCallback(
    (key: string, value: string | undefined) => {
      if (!pathname) return
      const params = new URLSearchParams(searchParams?.toString() || '')
      if (value === undefined || value === '') params.delete(key)
      else params.set(key, value)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    },
    [searchParams, router, pathname]
  )

  const setView = (next: 'month' | 'gantt') =>
    updateQueryParam('view', next === 'gantt' ? 'gantt' : undefined)
  const setViewType = (next: '3-month' | '6-month' | '12-month') =>
    updateQueryParam('strip', next === '6-month' ? undefined : next)

  const [selectedSite, setSelectedSite] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const search = useDebounced(searchInput, 350)

  useSSE()

  // Aylık takvim grid'i `dateFrom`'un ait olduğu ayı gösterir.
  // (Range birden fazla ayı kapsasa bile grid tek ay gösterir; Gantt view
  // tüm range'i çizer.)
  const currentDate = useMemo(() => {
    if (dateFrom) {
      const [y, m, d] = dateFrom.split('-').map((v) => parseInt(v, 10))
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
        return new Date(y, m - 1, d)
      }
    }
    return new Date()
  }, [dateFrom])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const { data, isLoading } = useQuery<CampaignResponse>({
    queryKey: [
      'campaigns-calendar',
      view,
      dateFrom,
      dateTo,
      selectedSite,
      selectedCategory,
      selectedStatus,
      search,
    ],
    queryFn: () =>
      fetchCampaigns({
        dateMode: 'active_during_range',
        dateFrom,
        dateTo,
        site: selectedSite || undefined,
        category: selectedCategory || undefined,
        status: selectedStatus || undefined,
        search: search || undefined,
        limit: 500,
      }),
  })

  const campaigns = data?.data || []

  // Press / event overlay — Türkiye event seed (migration 019).
  // Range'i biraz genişletiyoruz ki Gantt view de ileri/geri olayları görsün.
  const { data: pressEvents = [] } = useQuery<PressEvent[]>({
    queryKey: ['press-events-overlay', dateFrom, dateTo],
    queryFn: () => fetchPressEvents({ from: dateFrom, to: dateTo }),
  })
  const [activePressEvent, setActivePressEvent] = useState<PressEvent | null>(null)

  // Aylık view'da hücreye tıklandığında o günün tüm aktif kampanyalarını
  // listeleyen modal. ISO YYYY-MM-DD formatında günü tutuyoruz; modal
  // kapatılınca null'a çekiliyor (ESC + outside click → Modal component handle
  // ediyor).
  const [selectedDay, setSelectedDay] = useState<{
    iso: string
    label: string
    campaigns: Campaign[]
  } | null>(null)

  // Toggle selection — used by the ICS export action below.
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectAllVisible = () => setSelectedIds(new Set(campaigns.map((c) => c.id)))
  const clearSelection = () => setSelectedIds(new Set())

  const handleIcsExport = () => {
    const target =
      selectedIds.size > 0
        ? campaigns.filter((c) => selectedIds.has(c.id))
        : campaigns
    if (target.length === 0) return
    const ics = buildCampaignsIcs(
      target.map((c) => ({
        id: c.id,
        title: c.title,
        validFrom: c.validFrom,
        validTo: c.validTo,
        siteName: c.site?.name ?? null,
        category: c.category ? getCategoryLabel(c.category) : null,
      }))
    )
    const stamp = new Date().toISOString().slice(0, 10)
    downloadIcs(`rakip-analiz-kampanyalar-${stamp}.ics`, ics)
  }

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDayOfWeek = firstDay.getDay()
    const daysInMonth = lastDay.getDate()

    const days: Array<{
      date: number
      isCurrentMonth: boolean
      campaigns: Campaign[]
    }> = []

    const prevMonthLastDay = new Date(year, month, 0).getDate()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: prevMonthLastDay - i,
        isCurrentMonth: false,
        campaigns: [],
      })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dayCampaigns = campaigns.filter((c) => {
        const fromParts = getLocalDateParts(c.validFrom)
        const toParts = c.validTo ? getLocalDateParts(c.validTo) : null
        if (!fromParts && !toParts) return false
        const checkDate = { year, month, day: d }
        if (
          fromParts &&
          (fromParts.year > checkDate.year ||
            (fromParts.year === checkDate.year && fromParts.month > checkDate.month) ||
            (fromParts.year === checkDate.year &&
              fromParts.month === checkDate.month &&
              fromParts.day > checkDate.day))
        ) {
          return false
        }
        if (
          toParts &&
          (toParts.year < checkDate.year ||
            (toParts.year === checkDate.year && toParts.month < checkDate.month) ||
            (toParts.year === checkDate.year &&
              toParts.month === checkDate.month &&
              toParts.day < checkDate.day))
        ) {
          return false
        }
        return true
      })
      days.push({ date: d, isCurrentMonth: true, campaigns: dayCampaigns })
    }

    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: i, isCurrentMonth: false, campaigns: [] })
    }

    return days
  }, [year, month, campaigns])

  const setMonthRange = (y: number, m: number) => {
    const first = new Date(y, m, 1)
    const last = new Date(y, m + 1, 0)
    setRange(toIso(first.getFullYear(), first.getMonth(), first.getDate()),
             toIso(last.getFullYear(), last.getMonth(), last.getDate()))
  }
  const prevMonth = () => setMonthRange(year, month - 1)
  const nextMonth = () => setMonthRange(year, month + 1)

  const monthName = currentDate.toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
  })

  const today = new Date()
  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === d

  const weekDays = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

  const siteLegend = useMemo(() => getSiteColorEntries(), [])

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Kampanya Takvimi"
        description="Kampanyaların başlangıç ve bitiş tarihlerini takvim ve Gantt görünümünde izleyin."
        actions={
          <div className="flex items-center gap-2">
            {view === 'gantt' && (
              <div className="flex items-center gap-1 border rounded-md p-1">
                <Button
                  variant={viewType === '3-month' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewType('3-month')}
                  className="h-7 text-xs px-2"
                >
                  3A
                </Button>
                <Button
                  variant={viewType === '6-month' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewType('6-month')}
                  className="h-7 text-xs px-2"
                >
                  6A
                </Button>
                <Button
                  variant={viewType === '12-month' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewType('12-month')}
                  className="h-7 text-xs px-2"
                >
                  12A
                </Button>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              {monthName}
            </span>
            <Button variant="outline" size="sm" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <main className="p-6 space-y-4">
        {/* Global tarih aralığı header'ı — preset chip'ler + custom + sıfırla */}
        <DateRangePickerHeader scope="calendar" />

        {/* Filter toolbar */}
        <Card>
          <CardContent className="p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="text-xs text-muted-foreground">Arama</label>
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Başlık veya açıklama..."
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Site</label>
                <Select
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="mt-1"
                >
                  <option value="">Tüm siteler</option>
                  {siteLegend.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Kategori</label>
                <Select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="mt-1"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Durum</label>
                <Select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="mt-1"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 justify-between">
              <div className="text-xs text-muted-foreground">
                {selectedIds.size > 0
                  ? `${selectedIds.size} kampanya seçili`
                  : `${campaigns.length} kampanya gösteriliyor`}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllVisible}
                  disabled={campaigns.length === 0}
                >
                  Hepsini seç
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  disabled={selectedIds.size === 0}
                >
                  Temizle
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleIcsExport}
                  disabled={campaigns.length === 0}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  ICS olarak indir
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stat cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Bu Ay</span>
              </div>
              <div className="text-2xl font-bold mt-1">
                {
                  campaigns.filter((c) => {
                    const parts = getLocalDateParts(c.validFrom)
                    return parts && parts.year === year && parts.month === month
                  }).length
                }
              </div>
              <div className="text-xs text-muted-foreground">başlayan kampanya</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Bu Ay Biten</span>
              </div>
              <div className="text-2xl font-bold mt-1">
                {
                  campaigns.filter((c) => {
                    const parts = getLocalDateParts(c.validTo)
                    return parts && parts.year === year && parts.month === month
                  }).length
                }
              </div>
              <div className="text-xs text-muted-foreground">biten kampanya</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Aktif</span>
              </div>
              <div className="text-2xl font-bold mt-1">
                {campaigns.filter((c) => c.status === 'active').length}
              </div>
              <div className="text-xs text-muted-foreground">halen devam eden</div>
            </CardContent>
          </Card>
        </div>

        {/* View tabs: Aylık / Gantt */}
        <Tabs.Root
          value={view}
          onValueChange={(v) => setView(v as 'month' | 'gantt')}
          className="w-full"
        >
          <Tabs.List className="flex border-b mb-4">
            <Tabs.Trigger
              value="month"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              Aylık
            </Tabs.Trigger>
            <Tabs.Trigger
              value="gantt"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              Gantt
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="month" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{monthName} Takvimi</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Aylık görünüm — günlük başlama/bitiş kampanyaları site rengiyle.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-px bg-border/70 rounded-lg overflow-hidden">
                  {weekDays.map((day) => (
                    <div
                      key={day}
                      className="bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground"
                    >
                      {day}
                    </div>
                  ))}

                  {calendarDays.map((day, idx) => {
                    const startingToday = day.campaigns.filter((c) => {
                      const parts = getLocalDateParts(c.validFrom)
                      return (
                        parts &&
                        parts.year === year &&
                        parts.month === month &&
                        parts.day === day.date
                      )
                    })
                    const endingToday = day.campaigns.filter((c) => {
                      const parts = getLocalDateParts(c.validTo)
                      return (
                        parts &&
                        parts.year === year &&
                        parts.month === month &&
                        parts.day === day.date
                      )
                    })
                    const overlapCount = day.campaigns.length
                    // Press / event overlay — bu hücreye düşen TR event'leri.
                    const dayPressEvents = day.isCurrentMonth
                      ? getPressEventsForDay(pressEvents, year, month, day.date)
                      : []

                    const handleCellClick = () => {
                      if (!day.isCurrentMonth) return
                      if (day.campaigns.length === 0) return
                      const iso = toIso(year, month, day.date)
                      setSelectedDay({
                        iso,
                        label: new Date(year, month, day.date).toLocaleDateString('tr-TR', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        }),
                        campaigns: day.campaigns,
                      })
                    }
                    const cellClickable =
                      day.isCurrentMonth && day.campaigns.length > 0
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'min-h-[100px] p-2 bg-card',
                          !day.isCurrentMonth && 'bg-muted/30 opacity-50',
                          cellClickable &&
                            'cursor-pointer hover:bg-muted/40 transition-colors'
                        )}
                        onClick={cellClickable ? handleCellClick : undefined}
                        onKeyDown={
                          cellClickable
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  handleCellClick()
                                }
                              }
                            : undefined
                        }
                        role={cellClickable ? 'button' : undefined}
                        tabIndex={cellClickable ? 0 : undefined}
                        aria-label={
                          cellClickable
                            ? `${day.date}. gün — ${day.campaigns.length} kampanya, detayları gör`
                            : undefined
                        }
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div
                            className={cn(
                              'text-xs font-medium',
                              isToday(day.date)
                                ? 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center'
                                : ''
                            )}
                          >
                            {day.date}
                          </div>
                          <OverlapBadge count={overlapCount} />
                        </div>

                        {dayPressEvents.length > 0 && (
                          <div
                            className="mb-1 space-y-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {dayPressEvents.slice(0, 2).map((ev) => (
                              <PressEventBadge
                                key={ev.id}
                                event={ev}
                                onClick={() => setActivePressEvent(ev)}
                              />
                            ))}
                            {dayPressEvents.length > 2 && (
                              <button
                                type="button"
                                onClick={() => setActivePressEvent(dayPressEvents[2])}
                                className="text-[10px] text-muted-foreground hover:text-foreground"
                              >
                                +{dayPressEvents.length - 2} event
                              </button>
                            )}
                          </div>
                        )}

                        {startingToday.length > 0 && (
                          <div
                            className="mb-1 space-y-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {startingToday.slice(0, 2).map((c) => {
                              const color = getSiteColor(c.site?.code)
                              return (
                                <Link
                                  key={c.id}
                                  href={`/campaigns/${c.id}`}
                                  className="block text-[10px] rounded px-1 py-0.5 truncate"
                                  style={{
                                    backgroundColor: `${color}33`,
                                    borderLeft: `3px solid ${color}`,
                                    color: 'inherit',
                                  }}
                                  title={`${c.site?.name ?? ''} • ${c.title}`}
                                >
                                  + {c.title.slice(0, 18)}
                                </Link>
                              )
                            })}
                            {startingToday.length > 2 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{startingToday.length - 2} daha
                              </span>
                            )}
                          </div>
                        )}

                        {endingToday.length > 0 && (
                          <div
                            className="mb-1 space-y-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {endingToday.slice(0, 2).map((c) => {
                              const color = getSiteColor(c.site?.code)
                              return (
                                <Link
                                  key={c.id}
                                  href={`/campaigns/${c.id}`}
                                  className="block text-[10px] rounded px-1 py-0.5 truncate"
                                  style={{
                                    backgroundColor: `${color}22`,
                                    borderRight: `3px solid ${color}`,
                                    color: 'inherit',
                                  }}
                                  title={`${c.site?.name ?? ''} • ${c.title}`}
                                >
                                  − {c.title.slice(0, 18)}
                                </Link>
                              )
                            })}
                            {endingToday.length > 2 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{endingToday.length - 2} daha
                              </span>
                            )}
                          </div>
                        )}

                        {(() => {
                          const ongoing = day.campaigns.filter(
                            (c) =>
                              !startingToday.some((x) => x.id === c.id) &&
                              !endingToday.some((x) => x.id === c.id)
                          )
                          if (ongoing.length === 0) return null
                          return (
                            <div
                              className="space-y-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {ongoing.slice(0, 3).map((c) => {
                                const color = getSiteColor(c.site?.code)
                                return (
                                  <Link
                                    key={c.id}
                                    href={`/campaigns/${c.id}`}
                                    className="block text-[10px] rounded px-1 py-0.5 truncate hover:opacity-80"
                                    style={{
                                      backgroundColor: `${color}1a`,
                                      borderLeft: `2px dotted ${color}`,
                                      color: 'inherit',
                                    }}
                                    title={`${c.site?.name ?? ''} • ${c.title} (devam ediyor)`}
                                  >
                                    {c.title.slice(0, 22)}
                                  </Link>
                                )
                              })}
                              {ongoing.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{ongoing.length - 3} daha
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="gantt" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Gantt — Kampanya Zaman Çizelgesi</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Her satır bir kampanya. Bar uzunluğu valid_from → valid_to aralığını gösterir.
                  Renk siteye göredir.
                </p>
              </CardHeader>
              <CardContent>
                <GanttChart
                  campaigns={campaigns}
                  rangeStart={dateFrom}
                  rangeEnd={dateTo}
                />
              </CardContent>
            </Card>

            {/* Mevcut özet Gantt strip'i de burada koruyoruz - hızlı genel bakış için. */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Özet Strip (durum bazlı)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GanttStrip
                  campaigns={campaigns}
                  year={year}
                  viewType={viewType}
                />
              </CardContent>
            </Card>
          </Tabs.Content>
        </Tabs.Root>

        {/* Site renk legendi */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Site Renk Lejantı</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-xs">
              {siteLegend.map(({ code, color }) => (
                <span
                  key={code}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded border bg-card"
                >
                  <span
                    className="inline-block w-3 h-3 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  {code}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Press / Event takvim lejantı (migration 019) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Press Calendar Lejantı</CardTitle>
            <p className="text-xs text-muted-foreground">
              Türkiye event&apos;leri (dini, spor, ulusal, ticari). Hücredeki
              rozete tıklayın → geçen yıl rakipler ne yaptı görün.
            </p>
          </CardHeader>
          <CardContent>
            <PressEventLegend />
          </CardContent>
        </Card>

        {/* Cross-site overlap heatmap */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Çakışma Heatmap (site × tarih)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Aynı gün, aynı kategoride farklı sitelerden başlayan kampanyalar.
            </p>
          </CardHeader>
          <CardContent>
            <OverlapHeatmap rangeStart={dateFrom} rangeEnd={dateTo} />
          </CardContent>
        </Card>

        {isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            Kampanyalar yükleniyor...
          </div>
        )}
      </main>

      {/* Press event detay popover — YoY karşılaştırma içerir */}
      <PressEventDetailModal
        event={activePressEvent}
        onClose={() => setActivePressEvent(null)}
      />

      {/* Aylık takvim cell click modal — o güne ait tüm aktif kampanyalar */}
      <DayCampaignsModal
        day={selectedDay}
        onClose={() => setSelectedDay(null)}
      />
    </div>
  )
}

interface DayCampaignsModalProps {
  day: { iso: string; label: string; campaigns: Campaign[] } | null
  onClose: () => void
}

/**
 * Aylık görünümde bir hücreye tıklayınca açılan modal.
 * O gün aktif olan tüm kampanyaları kart listesi şeklinde gösterir;
 * her kart "Detayı Gör" linkiyle /campaigns/[id]'e yönlendirir.
 *
 * - ESC + outside click: shared `Modal` component üzerinden geliyor.
 * - Mobile: max-w sınırı olsa bile padding korunur; içerik scroll'lanır.
 */
function DayCampaignsModal({ day, onClose }: DayCampaignsModalProps) {
  const isOpen = day !== null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-2xl max-h-[85vh] overflow-y-auto"
    >
      {day && (
        <div className="space-y-4">
          <header className="border-b pb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold leading-tight">{day.label}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {`Bu gün aktif ${day.campaigns.length} kampanya — kartlardan "Detay"a tıklayarak tek kampanyayı aç, ESC ile modal'ı kapat.`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </header>

          {day.campaigns.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              Bu güne ait aktif kampanya yok.
            </div>
          ) : (
            <ul className="space-y-2">
              {day.campaigns.map((c) => {
                const color = getSiteColor(c.site?.code)
                return (
                  <li
                    key={c.id}
                    className="rounded-md border bg-card p-3"
                    style={{ borderLeft: `4px solid ${color}` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold leading-snug truncate">
                          {c.title}
                        </h3>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {c.site?.name && (
                            <Badge variant="secondary" className="text-[10px]">
                              {c.site.name}
                            </Badge>
                          )}
                          {c.category && (
                            <Badge variant="outline" className="text-[10px]">
                              {getCategoryLabel(c.category)}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2">
                          <BonusChips campaign={c} compact showEffective={false} />
                        </div>
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          {formatDateTr(c.validFrom)} → {formatDateTr(c.validTo)}
                        </div>
                      </div>
                      <Link
                        href={`/campaigns/${c.id}`}
                        onClick={onClose}
                        className="shrink-0 inline-flex items-center rounded-md border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        Detayı Gör
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}

function formatDateTr(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
