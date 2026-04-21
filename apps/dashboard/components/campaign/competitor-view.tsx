'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SectionHeader } from '@/components/ui/section-header'
import { getDisplaySentimentLabel } from '@/lib/campaign-presentation'
import { getSentimentColor, formatDate, formatDateRange } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, Crown, Target } from 'lucide-react'

interface RivalCampaign {
  id: string
  siteName: string
  siteCode: string
  title: string
  bonusAmount?: number
  bonusPercentage?: number
  validFrom?: string | null
  validTo?: string | null
  status: string
  sentiment?: string | null
  duration?: number
}

interface CompetitorViewProps {
  rivalCampaigns: RivalCampaign[]
  yourCampaign: {
    title: string
    bonusAmount?: number
    bonusPercentage?: number
    siteName: string
    status: string
  }
  bonusField?: 'amount' | 'percentage'
}

function getNumericBonus(campaign: RivalCampaign): number | null {
  if (campaign.bonusAmount) return campaign.bonusAmount
  if (campaign.bonusPercentage) return campaign.bonusPercentage
  return null
}

function formatBonus(campaign: RivalCampaign): string {
  if (campaign.bonusAmount) return `${campaign.bonusAmount} TL`
  if (campaign.bonusPercentage) return `%${campaign.bonusPercentage}`
  return '-'
}

function formatDuration(days: number | undefined): string {
  if (!days) return 'Belirsiz'
  if (days === 1) return '1 gun'
  if (days <= 7) return `${days} gun`
  if (days <= 30) return `${Math.floor(days / 7)} hafta`
  return `${Math.floor(days / 30)} ay`
}

function getDurationInDays(from: string | null | undefined, to: string | null | undefined): number | undefined {
  if (!from || !to) return undefined
  const start = new Date(from)
  const end = new Date(to)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return undefined
  const diff = end.getTime() - start.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function CompetitorView({ rivalCampaigns, yourCampaign, bonusField = 'amount' }: CompetitorViewProps) {
  const yourBonus = yourCampaign.bonusAmount || yourCampaign.bonusPercentage
  const yourNumericBonus = yourBonus || 0

  const getComparison = (rivalBonus: number | null) => {
    if (rivalBonus === null || yourBonus === null || yourBonus === 0) return null
    const diff = yourNumericBonus - rivalBonus
    const pct = ((diff / rivalBonus) * 100).toFixed(1)
    if (diff > 0) return { type: 'better', diff, pct: Number(pct) }
    if (diff < 0) return { type: 'worse', diff: Math.abs(diff), pct: Number(pct) }
    return { type: 'equal', diff: 0, pct: 0 }
  }

  const sortedRivals = [...rivalCampaigns].sort((a, b) => {
    const bonusA = getNumericBonus(a)
    const bonusB = getNumericBonus(b)
    if (bonusA === null && bonusB === null) return 0
    if (bonusA === null) return 1
    if (bonusB === null) return -1
    return bonusB - bonusA
  })

  const rank = sortedRivals.findIndex(
    (r) => r.siteCode === 'your-campaign' || r.siteName === yourCampaign.siteName
  ) + 1

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Rakip Karsilastirmasi"
          description="Ayni kategorideki rakiplerin kampanyalari ile karsilastirma"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Your campaign highlight */}
        <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              <span className="font-semibold">Senin Kampanyan</span>
              {rank > 0 && rank <= 3 && (
                <Badge className="bg-primary">{rank}. SIRADA</Badge>
              )}
            </div>
            <Badge className="bg-primary">{yourCampaign.status}</Badge>
          </div>
          <div className="mt-3">
            <p className="font-medium">{yourCampaign.title}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {yourCampaign.siteName}
            </p>
            <div className="flex items-center gap-4 mt-2">
              <div className="text-2xl font-bold text-primary">
                {yourBonus
                  ? yourCampaign.bonusAmount
                    ? `${yourCampaign.bonusAmount} TL`
                    : `%${yourCampaign.bonusPercentage}`
                  : '-'}
              </div>
              {rivalCampaigns.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Ortalama:{' '}
                  {(() => {
                    const bonuses = rivalCampaigns
                      .map((r) => getNumericBonus(r))
                      .filter((b): b is number => b !== null)
                    if (bonuses.length === 0) return '-'
                    const avg = bonuses.reduce((a, b) => a + b, 0) / bonuses.length
                    return yourCampaign.bonusAmount
                      ? `${avg.toFixed(0)} TL`
                      : `%${avg.toFixed(0)}`
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rival campaigns */}
        {sortedRivals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Rakip kampanya bulunamadi.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">
                Rakipler ({sortedRivals.length})
              </h4>
              <Target className="h-4 w-4 text-muted-foreground" />
            </div>
            {sortedRivals.map((rival, index) => {
              const rivalBonus = getNumericBonus(rival)
              const comparison = getComparison(rivalBonus)
              const duration = getDurationInDays(rival.validFrom, rival.validTo)
              const isBetter =
                comparison?.type === 'better' || (comparison?.type === 'equal' && yourNumericBonus >= (rivalBonus || 0))

              return (
                <div
                  key={rival.id}
                  className={`rounded-lg border p-4 ${
                    isBetter ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rival.siteName}</span>
                        <Badge variant="outline" className="text-xs">
                          #{index + 1}
                        </Badge>
                        {rival.sentiment && (
                          <Badge className={getSentimentColor(rival.sentiment)}>
                            {getDisplaySentimentLabel(rival.sentiment)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {rival.title}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {formatBonus(rival)}
                        </span>
                        {duration !== undefined && (
                          <>
                            <span>|</span>
                            <span>{formatDuration(duration)}</span>
                          </>
                        )}
                        {rival.validFrom && rival.validTo && (
                          <>
                            <span>|</span>
                            <span>{formatDateRange(rival.validFrom, rival.validTo)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {comparison && rivalBonus !== null && yourBonus !== null && (
                        <div
                          className={`flex items-center gap-1 text-xs font-medium ${
                            comparison.type === 'better'
                              ? 'text-green-600'
                              : comparison.type === 'worse'
                              ? 'text-red-600'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {comparison.type === 'better' ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : comparison.type === 'worse' ? (
                            <TrendingDown className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                          <span>
                            {comparison.type === 'equal'
                              ? 'Esit'
                              : `${comparison.type === 'better' ? '+' : '-'}${comparison.pct}%`}
                          </span>
                        </div>
                      )}
                      <Badge
                        className={
                          isBetter
                            ? 'bg-green-500 hover:bg-green-600'
                            : 'bg-red-500 hover:bg-red-600'
                        }
                      >
                        {isBetter ? 'Senin favorin' : 'Geri设计中'}
                      </Badge>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {rivalCampaigns.length > 0 && (
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground text-center">
              Bonus miktarlari ve yüzdeleri karsilastirmaya göre siralanmistir.
              <br />
              {yourBonus
                ? `Senin bonusun ${yourBonus}${yourCampaign.bonusAmount ? ' TL' : '%'}, ${rivalCampaigns.filter((r) => (getNumericBonus(r) || 0) < yourNumericBonus).length} rakipten daha yüksek.`
                : 'Bonus bilgisi mevcut degil.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function CompetitorTable({ campaigns }: { campaigns: RivalCampaign[] }) {
  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Rakip kampanya bulunamadi.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3 font-medium">Site</th>
            <th className="text-left py-2 px-3 font-medium">Kampanya</th>
            <th className="text-right py-2 px-3 font-medium">Bonus</th>
            <th className="text-right py-2 px-3 font-medium">Süre</th>
            <th className="text-center py-2 px-3 font-medium">Durum</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const duration = getDurationInDays(campaign.validFrom, campaign.validTo)
            return (
              <tr key={campaign.id} className="border-b hover:bg-muted/50">
                <td className="py-2 px-3 font-medium">{campaign.siteName}</td>
                <td className="py-2 px-3 text-muted-foreground">{campaign.title}</td>
                <td className="py-2 px-3 text-right font-semibold">{formatBonus(campaign)}</td>
                <td className="py-2 px-3 text-right">{formatDuration(duration)}</td>
                <td className="py-2 px-3 text-center">
                  {campaign.sentiment ? (
                    <Badge className={getSentimentColor(campaign.sentiment)}>
                      {getDisplaySentimentLabel(campaign.sentiment)}
                    </Badge>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
