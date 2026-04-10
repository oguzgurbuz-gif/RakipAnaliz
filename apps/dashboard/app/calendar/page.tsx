'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { useSSE } from '@/hooks/useSSE'
import { fetchCampaigns } from '@/lib/api'
import { getCategoryLabel } from '@/lib/category-labels'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'

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
}

type CampaignResponse = {
  data: Campaign[]
  total: number
}

function isValidDate(date: string | null | undefined): date is string {
  return !!date && !isNaN(new Date(date).getTime())
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedSite, setSelectedSite] = useState<string>('all')

  useSSE()

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const { data, isLoading } = useQuery<CampaignResponse>({
    queryKey: ['campaigns-calendar', year, month],
    queryFn: () => fetchCampaigns({
      dateMode: 'active_during_range',
      dateFrom: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      dateTo: `${year}-${String(month + 1).padStart(2, '0')}-31`,
      site: selectedSite === 'all' ? undefined : selectedSite,
      limit: 500,
    }),
  })

  const campaigns = data?.data || []

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

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: prevMonthLastDay - i,
        isCurrentMonth: false,
        campaigns: [],
      })
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayCampaigns = campaigns.filter(c => {
        if (!isValidDate(c.validFrom) && !isValidDate(c.validTo)) return false
        const from = new Date(c.validFrom!)
        const to = c.validTo ? new Date(c.validTo) : null
        const checkDate = new Date(dateStr)
        return checkDate >= from && (!to || checkDate <= to)
      })
      days.push({ date: d, isCurrentMonth: true, campaigns: dayCampaigns })
    }

    // Next month padding
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: i, isCurrentMonth: false, campaigns: [] })
    }

    return days
  }, [year, month, campaigns])

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const monthName = currentDate.toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
  })

  const today = new Date()
  const isToday = (d: number) =>
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === d

  const weekDays = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'ended': return 'bg-gray-100 text-gray-800'
      case 'pending': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Kampanya Takvimi"
        description="Kampanyaların başlangıç ve bitiş tarihlerini takvim görünümünde izleyin."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">{monthName}</span>
            <Button variant="outline" size="sm" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <main className="p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Bu Ay</span>
              </div>
              <div className="text-2xl font-bold mt-1">
                {campaigns.filter(c => isValidDate(c.validFrom) &&
                  new Date(c.validFrom!).getMonth() === month &&
                  new Date(c.validFrom!).getFullYear() === year
                ).length}
              </div>
              <div className="text-xs text-muted-foreground">başlayan kampanya</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Bu Ay Bitan</span>
              </div>
              <div className="text-2xl font-bold mt-1">
                {campaigns.filter(c => isValidDate(c.validTo) &&
                  new Date(c.validTo!).getMonth() === month &&
                  new Date(c.validTo!).getFullYear() === year
                ).length}
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
                {campaigns.filter(c => c.status === 'active').length}
              </div>
              <div className="text-xs text-muted-foreground">halen devam eden</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{monthName} Takvimi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px bg-border/70 rounded-lg overflow-hidden">
              {weekDays.map((day) => (
                <div key={day} className="bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground">
                  {day}
                </div>
              ))}

              {calendarDays.map((day, idx) => {
                const hasCampaigns = day.campaigns.length > 0
                const activeCampaigns = day.campaigns.filter(c => c.status === 'active')
                const startingToday = day.campaigns.filter(c =>
                  isValidDate(c.validFrom) &&
                  new Date(c.validFrom!).getDate() === day.date &&
                  new Date(c.validFrom!).getMonth() === month
                )
                const endingToday = day.campaigns.filter(c =>
                  isValidDate(c.validTo) &&
                  new Date(c.validTo!).getDate() === day.date &&
                  new Date(c.validTo!).getMonth() === month
                )

                return (
                  <div
                    key={idx}
                    className={cn(
                      'min-h-[100px] p-2 bg-card',
                      !day.isCurrentMonth && 'bg-muted/30 opacity-50',
                    )}
                  >
                    <div className={cn(
                      'text-xs font-medium mb-1',
                      isToday(day.date) ? 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center' : ''
                    )}>
                      {day.date}
                    </div>

                    {startingToday.length > 0 && (
                      <div className="mb-1">
                        {startingToday.slice(0, 2).map((c) => (
                          <Link
                            key={c.id}
                            href={`/campaigns/${c.id}`}
                            className="block text-xs bg-green-100 text-green-800 rounded px-1 py-0.5 mb-0.5 truncate hover:bg-green-200"
                          >
                            + {c.title.slice(0, 15)}
                          </Link>
                        ))}
                        {startingToday.length > 2 && (
                          <span className="text-xs text-muted-foreground">+{startingToday.length - 2} daha</span>
                        )}
                      </div>
                    )}

                    {endingToday.length > 0 && (
                      <div className="mb-1">
                        {endingToday.slice(0, 2).map((c) => (
                          <Link
                            key={c.id}
                            href={`/campaigns/${c.id}`}
                            className="block text-xs bg-red-100 text-red-800 rounded px-1 py-0.5 mb-0.5 truncate hover:bg-red-200"
                          >
                            - {c.title.slice(0, 15)}
                          </Link>
                        ))}
                        {endingToday.length > 2 && (
                          <span className="text-xs text-muted-foreground">+{endingToday.length - 2} daha</span>
                        )}
                      </div>
                    )}

                    {hasCampaigns && startingToday.length === 0 && endingToday.length === 0 && (
                      <div className="text-xs text-muted-foreground">
                        {day.campaigns.length} aktif
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            Kampanyalar yükleniyor...
          </div>
        )}
      </main>
    </div>
  )
}