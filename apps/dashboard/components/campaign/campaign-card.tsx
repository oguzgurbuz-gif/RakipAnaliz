'use client'

import * as React from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataQualityBadge } from '@/components/ui/data-quality-badge'
import { BonusChips } from '@/components/ui/bonus-chips'
import { IntentBadge } from '@/components/ui/intent-badge'
import { resolveCampaignDateDisplay } from '@/lib/campaign-dates'
import { getCampaignQualitySignals, getCampaignTypeLabel } from '@/lib/campaign-presentation'
import { StatusBadge } from '@/components/campaign/status-badge'
import type { Campaign } from '@/types'

interface CampaignCardProps {
  campaign: Campaign
}

export function CampaignCard({ campaign }: CampaignCardProps) {
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
            {campaign.status && <StatusBadge status={campaign.status} className="shrink-0" />}
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
          {/* Type and competitive intent row */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm">
              <span className="font-medium">Tür:</span> {getCampaignTypeLabel(campaign)}
            </span>
            <IntentBadge value={campaign.competitiveIntent} />
          </div>
          {/* Bonus chips — bonus, %, min deposit, turnover, effective bonus
              hepsini tek BonusChips component'i renkli render eder. */}
          <div className="mt-2">
            <BonusChips campaign={campaign} showEffective />
          </div>
          {/* Cashback hâlâ chip-stack dışında — BonusChips bilinçli olarak
              cashback'i temsil etmiyor (UI'da göründüğünde "extra" sayılır). */}
          {(campaign.metadata as any)?.ai_analysis?.extractedTags?.cashback_percent && (
            <div className="mt-1">
              <Badge variant="outline" className="text-xs">
                Cashback: %{(campaign.metadata as any)?.ai_analysis?.extractedTags?.cashback_percent}
              </Badge>
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
