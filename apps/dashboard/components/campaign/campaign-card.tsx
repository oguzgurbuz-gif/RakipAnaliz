'use client'

import * as React from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataQualityBadge } from '@/components/ui/data-quality-badge'
import { resolveCampaignDateDisplay } from '@/lib/campaign-dates'
import { getCampaignQualitySignals, getCampaignTypeLabel, getDisplaySentimentLabel } from '@/lib/campaign-presentation'
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

  return (
    <Link href={`/campaigns/${campaign.id}`}>
      <Card className="h-full transition-all hover:-translate-y-0.5 hover:bg-accent/30 hover:shadow-md cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-medium line-clamp-2">
              {campaign.title}
            </CardTitle>
            {campaign.status && (
              <Badge className={cn('shrink-0', statusClass)}>
                {campaign.status}
              </Badge>
            )}
          </div>
          {campaign.site && (
            <p className="text-sm text-muted-foreground">{campaign.site.name}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm">
            <span className="font-medium">Tür:</span> {getCampaignTypeLabel(campaign)}
          </div>
          <div className="flex flex-wrap gap-2">
            {(campaign.sentiment || campaign.aiSentiment) && (
              <Badge className={sentimentClass}>
                {getDisplaySentimentLabel(campaign.sentiment || campaign.aiSentiment)}
              </Badge>
            )}
            {qualitySignals.slice(0, 2).map((signal) => (
              <DataQualityBadge key={signal.code} signal={signal} compact />
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            <div>İlk görülme: {formatDate(campaign.firstSeen)}</div>
            <div>Son görülme: {formatDate(campaign.lastSeen)}</div>
            <div>Başlangıç: {startDate.value || 'Belirsiz'}</div>
            <div>Bitiş: {endDate.value || 'Belirsiz'}</div>
          </div>
          {(campaign.metadata as any)?.ai_analysis?.extractedTags && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(campaign.metadata as any)?.ai_analysis?.extractedTags?.bonus_amount && (
                <Badge variant="outline" className="text-xs">
                  {(campaign.metadata as any)?.ai_analysis?.extractedTags?.bonus_amount} TL
                </Badge>
              )}
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
        </CardContent>
      </Card>
    </Link>
  )
}
