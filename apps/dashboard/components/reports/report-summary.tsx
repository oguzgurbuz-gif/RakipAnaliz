'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ReportSummary, WeeklyReportDetail } from '@/types'

interface ReportSummaryProps {
  data: ReportSummary | WeeklyReportDetail | null
  showDetails?: boolean
}

export function ReportSummaryComponent({ data, showDetails = false }: ReportSummaryProps) {
  if (!data) return null

  const summaryData = data as ReportSummary & Partial<WeeklyReportDetail>

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Başlayan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryData.startedCount ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Biten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryData.endedCount ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aktif
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryData.activeCount ?? summaryData.activeOverlapCount ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pasif
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryData.passiveCount ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Değişen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryData.changedCount ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {showDetails && summaryData.topCategories && summaryData.topCategories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>En Çok Görülen Türler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summaryData.topCategories.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm">{item.category}</span>
                  <Badge variant="secondary">{item.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showDetails && summaryData.topSites && summaryData.topSites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>En Çok Kampanya Olan Siteler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summaryData.topSites.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm">{item.siteName}</span>
                  <Badge variant="secondary">{item.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showDetails && 'risks' in summaryData && summaryData.risks && summaryData.risks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Riskler</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {summaryData.risks.map((risk, index) => (
                <li key={index} className="text-sm">{risk}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {showDetails && 'recommendations' in summaryData && summaryData.recommendations && summaryData.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Öneriler</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {summaryData.recommendations.map((rec, index) => (
                <li key={index} className="text-sm">{rec}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
