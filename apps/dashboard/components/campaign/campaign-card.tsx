'use client'

import * as React from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataQualityBadge } from '@/components/ui/data-quality-badge'
import { resolveCampaignDateDisplay } from '@/lib/campaign-dates'
import { getCampaignQualitySignals, getCampaignTypeLabel, getDisplaySentimentLabel, getDisplayStatusLabel } from '@/lib/campaign-presentation'
import { formatDate, getSentimentColor, getStatusColor, cn } from '@/lib/utils'
import type { Campaign } from '@/types'

interface CampaignCardProps {
  campaign: Campaign
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  const sentimentClass = getSentimentColor(campaign.sentiment || campaign.aiSentiment || 'neutral')
  const statusClass = getStatusColor(campaign.status)
  const qualitySignals = getCampaignQualitySignals(campaign)
  const startDate = resolveCampaignDateDisplay(campaign.validFrom, campaign.validFromSource, campaign.body, 'start')
  const endDate = resolveCampaignDateDisplay(campaign.validTo, campaign.validToSource, campaign.body, 'end')

  // FE-13: Reorder info priority - status first (most important), then title, site, dates, type, etc.
  // Priority order: Status > Title > Site > Valid Dates > Type > AI Bonus Info > Quality Signals

  return (
    <Link href={`/campaigns/${campaign.id}`}>
      <Card className="h-full transition-all hover:-translate-y-0.5 hover:bg-accent/30 hover:shadow-md cursor-pointer">
        <CardHeader className="pb-2">
          {/* FE-13: Status badge at top for visibility */}
          <div className="flex items-start justify-between gap-2 mb-2">
            {campaign.status && (
              <Badge className={cn('shrink-0', statusClass)}>
                {getDisplayStatusLabel(campaign.status)}
              </Badge>
            )}
            {/* FE-13: Show bonus amount prominently if available */}
            {(campaign.metadata as any)?.ai_analysis?.extractedTags?.bonus_amount && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                ₺{(campaign.metadata as any)?.ai_analysis?.extractedTags?.bonus_amount}
              </Badge>
            )}
          </div>
          {/* Title - most important after status */}
          <CardTitle className="text-base font-medium line-clamp-2">
            {campaign.title}
          </CardTitle>
          {/* Site name */}
          {campaign.site && (
            <p className="text-sm text-muted-foreground">{campaign.site.name}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {/* FE-13: Dates prominently displayed */}
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Başlangıç:</span>{' '}
              <span className={startDate.value ? 'font-medium' : 'text-muted-foreground'}>
                {startDate.value || 'Belirsiz'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Bitiş:</span>{' '}
              <span className={endDate.value ? 'font-medium' : 'text-muted-foreground'}>
                {endDate.value || 'Belirsiz'}
              </span>
            </div>
          </div>
          {/* Type and sentiment row */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm">
              <span className="font-medium">Tür:</span> {getCampaignTypeLabel(campaign)}
            </span>
            {(campaign.sentiment || campaign.aiSentiment) && (
              <Badge className={sentimentClass}>
                {getDisplaySentimentLabel(campaign.sentiment || campaign.aiSentiment)}
              </Badge>
            )}
          </div>
          {/* AI extracted bonus tags */}
          {(campaign.metadata as any)?.ai_analysis?.extractedTags && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(campaign.metadata as any)?.ai_analysis?.extractedTags?.bonus_percentage && (
                <Badge variant="outline" className="text-xs">
                  %{(campaign.metadata as any)?.ai_analysis?.extractedTags?.bonus_percentage}
                </Badge>
              )}
              {(campaign.metadata as any)?.ai_analysis?.extractedTags?.min_deposit && (
                <Badge variant="outline" className="text-xs">
                  Min: {(campaign.metadata as any)?.ai_analysis?.extractedTags?.min_deposit} TL
                </Badge>
              )}
              {(campaign.metadata as any)?.ai_analysis?.extractedTags?.turnover && (
                <Badge variant="outline" className="text-xs">
                  Çevrim: {(campaign.metadata as any)?.ai_analysis?.extractedTags?.turnover}
                </Badge>
              )}
              {(campaign.metadata as any)?.ai_analysis?.extractedTags?.free_bet_amount && (
                <Badge variant="outline" className="text-xs">
                  Freebet: {(campaign.metadata as any)?.ai_analysis?.extractedTags?.free_bet_amount} TL
                </Badge>
              )}
              {(campaign.metadata as any)?.ai_analysis?.extractedTags?.cashback_percent && (
                <Badge variant="outline" className="text-xs">
                  Cashback: %{(campaign.metadata as any)?.ai_analysis?.extractedTags?.cashback_percent}
                </Badge>
              )}
            </div>
          )}
          {/* Quality signals at bottom */}
          {qualitySignals.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {qualitySignals.slice(0, 2).map((signal) => (
                <DataQualityBadge key={signal.code} signal={signal} compact />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
