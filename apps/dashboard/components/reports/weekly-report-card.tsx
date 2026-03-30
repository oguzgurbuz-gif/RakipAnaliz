'use client'

import * as React from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { WeeklyReport } from '@/types'
import { Calendar, Globe, Megaphone, TrendingUp, CheckCircle, Clock } from 'lucide-react'

interface WeeklyReportCardProps {
  report: WeeklyReport
}

export function WeeklyReportCard({ report }: WeeklyReportCardProps) {
  return (
    <Link href={`/reports/weekly/${report.id}`}>
      <Card className="transition-all hover:shadow-md hover:border-primary/50 cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg font-semibold">
              Hafta {report.weekNumber}
            </CardTitle>
            <Badge variant={report.status === 'generated' ? 'default' : 'secondary'}>
              {report.status === 'generated' ? 'Hazır' : report.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{report.year}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(report.weekStart)} - {formatDate(report.weekEnd)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" />
              <span className="text-sm">{report.siteCoverageCount} Site</span>
            </div>
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-purple-500" />
              <span className="text-sm">{report.campaignCount} Kampanya</span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs">{report.startedCount} Başlayan</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs">{report.activeOverlapCount} Aktif</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs">{report.endedCount} Biten</span>
            </div>
          </div>

          {report.executiveSummary && (
            <p className="text-xs text-muted-foreground line-clamp-2 pt-2 border-t">
              {report.executiveSummary}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
