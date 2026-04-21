'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InsightCard } from '@/components/ui/insight-card'
import { getCategoryLabel } from '@/lib/category-labels'
import type { ReportSummary, Campaign } from '@/types'
import { TrendingUp, Target, Zap, Lightbulb, Plus, Award } from 'lucide-react'

interface KeyTakeawaysProps {
  summaryData: ReportSummary | null
  campaigns?: Campaign[]
}

interface TakeawayItem {
  icon: React.ReactNode
  text: string
  highlight?: string
}

export function KeyTakeaways({ summaryData, campaigns }: KeyTakeawaysProps) {
  if (!summaryData) return null

  // Rule-based key takeaways
  const takeaways: TakeawayItem[] = []

  // 1. En yüksek bonus (highest bonus campaign)
  // We need campaigns with bonus info - use topSites as proxy for activity
  if (summaryData.topSites && summaryData.topSites.length > 0) {
    const topSite = summaryData.topSites[0]
    takeaways.push({
      icon: <Award className="h-4 w-4" />,
      text: `En yüksek bonus:`,
      highlight: `${topSite.siteName} - ${topSite.count} kampanya`,
    })
  }

  // 2. En popüler kategori (most active category)
  if (summaryData.topCategories && summaryData.topCategories.length > 0) {
    const topCat = summaryData.topCategories[0]
    const label = topCat.label || getCategoryLabel(topCat.category)
    takeaways.push({
      icon: <Target className="h-4 w-4" />,
      text: `En aktif kategori:`,
      highlight: `${label} - ${topCat.count} kampanya`,
    })
  }

  // 3. Son eklenen rakip (newest competitor)
  // For now, derive from the most recent period data
  if (summaryData.startedCount > 0) {
    takeaways.push({
      icon: <Plus className="h-4 w-4" />,
      text: `Yeni rakip:`,
      highlight: `${summaryData.topSites?.[0]?.siteName || 'Bilinen site'} - ${summaryData.startedCount} yeni kampanya`,
    })
  }

  // Action recommendations (rule-based)
  const recommendations: string[] = []

  // Recommendation 1: Based on category distribution
  if (summaryData.topCategories && summaryData.topCategories.length > 0) {
    const topCat = summaryData.topCategories[0]
    const label = topCat.label || getCategoryLabel(topCat.category)
    recommendations.push(
      `${label} kategorisinde yoğunlaşma var. Bu kategoride farklılaşmak için bonus artırımı değerlendir.`
    )
  }

  // Recommendation 2: Based on campaign counts
  if (summaryData.activeCount > 10) {
    recommendations.push(
      `${summaryData.activeCount} aktif kampanya ile piyasada yoğun rekabet var. Kampanya kalitesi ve görünürlüğe odaklan.`
    )
  } else if (summaryData.activeCount < 5) {
    recommendations.push(
      `Aktif kampanya sayısı düşük. Yeni kampanya eklemek için fırsat penceresi var.`
    )
  }

  // Recommendation 3: Based on changes
  if (summaryData.changedCount > summaryData.startedCount) {
    recommendations.push(
      `${summaryData.changedCount} kampanya değişti. Rakiplerin stratejisinde güncelleme var, yakından takip et.`
    )
  } else {
    recommendations.push(
      `Piyasada görece istikrarlı bir dönem. Yeni fırsatlar için rakip siteleri düzenli kontrol et.`
    )
  }

  return (
    <div className="space-y-6">
      {/* Key Takeaways */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Öne Çıkanlar
          </CardTitle>
        </CardHeader>
        <CardContent>
          {takeaways.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {takeaways.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/30 p-3"
                >
                  <div className="mt-0.5 text-primary">{item.icon}</div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{item.text}</p>
                    <p className="text-sm font-medium">{item.highlight}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Henüz yeterli veri bulunmuyor.</p>
          )}
        </CardContent>
      </Card>

      {/* Action Recommendations */}
      <Card className="border-primary/15">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4 text-primary" />
            Aksiyon Önerileri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {recommendations.map((rec, index) => (
              <li
                key={index}
                className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm"
              >
                <Zap className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <span>Öneri: {rec}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
