'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { InsightCard } from '@/components/ui/insight-card'
import { SectionHeader } from '@/components/ui/section-header'
import { getCategoryLabel } from '@/lib/category-labels'
import type { ReportSummary, WeeklyReportDetail } from '@/types'
import { Activity, AlertTriangle, BarChart3, Globe, Lightbulb, Shapes, TrendingUp } from 'lucide-react'

interface ReportSummaryProps {
  data: ReportSummary | WeeklyReportDetail | null
  showDetails?: boolean
}

export function ReportSummaryComponent({ data, showDetails = false }: ReportSummaryProps) {
  if (!data) return null

  const summaryData = data as ReportSummary & Partial<WeeklyReportDetail>
  const topCategory = summaryData.topCategories?.[0]
  const topSite = summaryData.topSites?.[0]
  const activeCount = summaryData.activeCount ?? summaryData.activeOverlapCount ?? 0

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <InsightCard
          icon={TrendingUp}
          title="Başlayan"
          value={summaryData.startedCount ?? 0}
          description="Seçilen aralıkta yeni görülen kampanyalar"
        />
        <InsightCard
          icon={Activity}
          title="Aktif"
          value={activeCount}
          description="Halen yayında veya aralığa temas eden kampanyalar"
          tone="positive"
        />
        <InsightCard
          icon={BarChart3}
          title="Biten"
          value={summaryData.endedCount ?? 0}
          description="Bitişi seçilen aralığa denk gelen kampanyalar"
        />
        <InsightCard
          icon={AlertTriangle}
          title="Pasif"
          value={summaryData.passiveCount ?? 0}
          description="Gizlenmiş ya da pasif duruma düşmüş kayıtlar"
          tone="warning"
        />
        <InsightCard
          icon={Shapes}
          title="Değişen"
          value={summaryData.changedCount ?? 0}
          description="İçeriği veya durumu güncellenen kampanyalar"
          tone="info"
        />
      </div>

      {showDetails && (
        <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-card via-card to-sky-50/40">
          <CardContent className="p-6">
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="space-y-2">
                <Badge variant="info" className="w-fit">Yönetici Özeti</Badge>
                <h3 className="text-xl font-semibold tracking-tight">
                  {topCategory
                    ? `${topCategory.label || getCategoryLabel(topCategory.category)} görünürlüğü öne çıkıyor.`
                    : 'Kampanya hareketliliği bu aralıkta sınırlı görünüyor.'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {activeCount} aktif kampanya, {summaryData.startedCount ?? 0} yeni başlangıç ve {summaryData.changedCount ?? 0} değişim kaydı ile dönem özeti hazırlandı.
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/85 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Odak Noktası</div>
                <p className="mt-2 text-sm">
                  {topSite
                    ? `${topSite.siteName} bu aralıkta ${topSite.count} kampanya ile en görünür site konumunda.`
                    : 'Site bazlı öne çıkan yoğunluk bulunmuyor.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showDetails && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <SectionHeader
                title="En Çok Görülen Türler"
                description="Kategori kodları normalize edilerek daha okunur etiketlerle sunulur."
              />
            </CardHeader>
            <CardContent>
              {summaryData.topCategories && summaryData.topCategories.length > 0 ? (
                <div className="space-y-3">
                  {summaryData.topCategories.map((item, index) => {
                    const label = item.label || getCategoryLabel(item.category)
                    const share = item.share ?? (summaryData.topCategories.length > 0 ? item.count / summaryData.topCategories.reduce((sum, current) => sum + current.count, 0) : 0)
                    return (
                      <div key={`${item.category}-${index}`} className="space-y-2 rounded-xl border border-border/70 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">{label}</div>
                            <div className="text-xs text-muted-foreground">{item.count} kampanya</div>
                          </div>
                          <Badge variant="secondary">%{Math.round(share * 100)}</Badge>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/80"
                            style={{ width: `${Math.max(8, Math.round(share * 100))}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={Shapes}
                  title="Kategori özeti henüz oluşmadı"
                  description="Bu tarih aralığında anlamlı kategori verisi bulunamadı."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionHeader
                title="En Çok Kampanya Olan Siteler"
                description="Hangi rakiplerin daha görünür bir kampanya temposu yakaladığını gösterir."
              />
            </CardHeader>
            <CardContent>
              {summaryData.topSites && summaryData.topSites.length > 0 ? (
                <div className="space-y-3">
                  {summaryData.topSites.map((item, index) => {
                    const maxCount = Math.max(...summaryData.topSites.map((site) => site.count), 1)
                    const width = Math.round((item.count / maxCount) * 100)
                    return (
                      <div key={`${item.siteName}-${index}`} className="space-y-2 rounded-xl border border-border/70 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium">{item.siteName}</div>
                          <Badge variant="secondary">{item.count}</Badge>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-sky-500/80" style={{ width: `${Math.max(10, width)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={Globe}
                  title="Site dağılımı boş"
                  description="Seçilen aralık için site bazlı görünürlük verisi bulunamadı."
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {showDetails && 'risks' in summaryData && summaryData.risks && summaryData.risks.length > 0 && (
        <Card>
          <CardHeader>
            <SectionHeader title="Riskler" description="Öne çıkan zayıflıklar ve izlenmesi gereken sinyaller." />
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {summaryData.risks.map((risk, index) => (
                <li key={index} className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">{risk}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {showDetails && 'recommendations' in summaryData && summaryData.recommendations && summaryData.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <SectionHeader title="Öneriler" description="Aksiyon alınabilecek kısa stratejik öneriler." />
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {summaryData.recommendations.map((rec, index) => (
                <li key={index} className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="mt-0.5 h-4 w-4 text-primary" />
                    <span>{rec}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
