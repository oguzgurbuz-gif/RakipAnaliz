'use client'

import * as React from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { WeeklyReport } from '@/types'
import { Calendar, Globe, Megaphone, TrendingUp, CheckCircle, Clock, ArrowRight, AlertTriangle } from 'lucide-react'

interface WeeklyReportCardProps {
  report: WeeklyReport
}

export function WeeklyReportCard({ report }: WeeklyReportCardProps) {
  const keyFinding = report.startedCount > report.endedCount
    ? `${report.startedCount} yeni başlangıç ile haftanın temposu yükseldi.`
    : report.endedCount > 0
      ? `${report.endedCount} kampanya kapanışı ile görünürlük daraldı.`
      : `${report.activeOverlapCount} kampanya hafta boyunca aktif kaldı.`

  return (
    <Link href={`/reports/weekly/${report.id}`}>
      <Card className="h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold">
                Hafta {report.weekNumber}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{report.year}</p>
            </div>
            <Badge variant={report.status === 'generated' ? 'default' : 'secondary'}>
              {report.status === 'generated' ? 'Hazır' : report.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(report.weekStart)} - {formatDate(report.weekEnd)}</span>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/40 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Öne Çıkan Bulgu
            </div>
            <p className="text-muted-foreground">{report.executiveSummary || keyFinding}</p>
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

          <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
            <span>{report.changedCount} değişen kayıt</span>
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              Detayı aç
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
