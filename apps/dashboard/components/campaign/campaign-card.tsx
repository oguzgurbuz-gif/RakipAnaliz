'use client'

import * as React from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataQualityBadge } from '@/components/ui/data-quality-badge'
import { BonusChips } from '@/components/ui/bonus-chips'
import { IntentBadge } from '@/components/ui/intent-badge'
import { resolveCampaignDateDisplay } from '@/lib/campaign-dates'
import {
  getCampaignBonusInfo,
  getCampaignQualitySignals,
  getCampaignTypeLabel,
} from '@/lib/campaign-presentation'
import { StatusBadge } from '@/components/campaign/status-badge'
import { getSiteDisplayName } from '@/lib/i18n/site'
import { formatCurrency } from '@/lib/format/currency'
import type { Campaign } from '@/types'

interface CampaignCardProps {
  campaign: Campaign
}

/**
 * FE-13 — Kampanya kartı bilgi hiyerarşisi.
 *
 * Önem sırası (en üstte en önemli):
 *   1. Başlık + durum badge'i (Aktif / Sona Ermiş)
 *   2. Site adı (`getSiteDisplayName` ile)
 *   3. Bonus tutarı / yüzdesi (vurgulu — kart üzerinde göze çarpan ana metrik)
 *   4. Tarih aralığı (validFrom → validTo)
 *   5. Kategori / kampanya türü
 *   6. Sekonder metadata (intent, cashback, kalite sinyalleri)
 *
 * Tipografi: başlık `text-base font-semibold`, bonus `text-xl font-bold`,
 * diğer alanlar `text-sm` veya `text-xs` ile ikincil tonda.
 */
export function CampaignCard({ campaign }: CampaignCardProps) {
  const qualitySignals = getCampaignQualitySignals(campaign)
  const bonusInfo = getCampaignBonusInfo(campaign)
  const startDate = resolveCampaignDateDisplay(
    campaign.validFrom,
    campaign.validFromSource,
    campaign.body,
    'start'
  )
  const endDate = resolveCampaignDateDisplay(
    campaign.validTo,
    campaign.validToSource,
    campaign.body,
    'end'
  )

  // FE-13: Bonus özet metni — amount ya da % varsa vurgulu göstereceğiz.
  // Yalnızca free-bet veya başka bir signal varsa BonusChips devraldığı için
  // burada amount/% yoksa hero alanı gizlenir.
  const heroBonus = (() => {
    if (bonusInfo.amount !== null) return formatCurrency(bonusInfo.amount)
    if (bonusInfo.percentage !== null) return `%${bonusInfo.percentage}`
    return null
  })()

  const cashback =
    (campaign.metadata as { ai_analysis?: { extractedTags?: { cashback_percent?: number } } } | null)
      ?.ai_analysis?.extractedTags?.cashback_percent

  const dateRange = (() => {
    if (!startDate.value && !endDate.value) return null
    return `${startDate.value || 'Belirsiz'} → ${endDate.value || 'Belirsiz'}`
  })()

  return (
    <Link href={`/campaigns/${campaign.id}`}>
      <Card className="h-full transition-all hover:-translate-y-0.5 hover:bg-accent/30 hover:shadow-md cursor-pointer">
        <CardHeader className="pb-2 space-y-1">
          {/* FE-13/1: Başlık + status (yan yana, status sağda hizalı) */}
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold leading-snug line-clamp-2">
              {campaign.title}
            </CardTitle>
            {campaign.status && <StatusBadge status={campaign.status} className="shrink-0" />}
          </div>
          {/* FE-13/2: Site adı — merkezi `getSiteDisplayName` ile, payload'da
              `name` yoksa code → Title Case fallback. */}
          {(campaign.site?.name || campaign.site?.code) && (
            <p className="text-sm font-medium text-muted-foreground">
              {getSiteDisplayName(campaign.site?.code, campaign.site?.name)}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* FE-13/3: Bonus — kartın ana metrik bloğu, tipografi ile vurgulu.
              Hem hero satırı (amount / %) hem altında ek chip'ler (min depo,
              çevrim, free-bet) BonusChips ile renkli. */}
          {heroBonus && (
            <div className="rounded-md bg-primary/5 px-3 py-2 border border-primary/10">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Bonus
              </p>
              <p className="text-xl font-bold font-mono tabular-nums text-primary">
                {heroBonus}
              </p>
            </div>
          )}
          <BonusChips campaign={campaign} showEffective compact />

          {/* FE-13/4: Tarih aralığı — başlangıç → bitiş tek satırda. */}
          {dateRange && (
            <div className="text-sm">
              <span className="text-muted-foreground">Tarih:</span>{' '}
              <span className="font-medium">{dateRange}</span>
            </div>
          )}

          {/* FE-13/5: Kategori / tür — IntentBadge ile aynı satırda. */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Tür:</span>
            <span className="font-medium">{getCampaignTypeLabel(campaign)}</span>
            <IntentBadge value={campaign.competitiveIntent} />
          </div>

          {/* FE-13/6: Sekonder — cashback + kalite sinyalleri, en altta. */}
          {(cashback || qualitySignals.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
              {cashback ? (
                <Badge variant="outline" className="text-xs">
                  Cashback: %{cashback}
                </Badge>
              ) : null}
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
