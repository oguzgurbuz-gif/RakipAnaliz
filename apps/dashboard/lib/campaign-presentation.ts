import { AlertTriangle, CalendarClock, Brain, type LucideIcon } from 'lucide-react'
import { getCategoryLabel } from '@/lib/category-labels'
import { resolveCampaignDateDisplay } from '@/lib/campaign-dates'

type CampaignLike = {
  title?: string | null
  body?: string | null
  validFrom?: string | null
  validTo?: string | null
  validFromSource?: string | null
  validToSource?: string | null
  category?: string | null
  sentiment?: string | null
  aiSentiment?: string | null
  aiSummary?: string | null
  metadata?: Record<string, unknown> | null
}

export type QualitySignal = {
  code: 'suspicious' | 'missing_dates' | 'ai_missing'
  label: string
  variant: 'warning' | 'info'
  icon: LucideIcon
}

const GENERIC_TITLES = new Set(['kampanyalar', 'güncel kampanyalar'])

export function getDisplayCategoryLabel(category: string | null | undefined): string {
  return getCategoryLabel(category)
}

export function getDisplaySentimentLabel(sentiment: string | null | undefined): string {
  if (sentiment === 'positive') return 'Pozitif'
  if (sentiment === 'negative') return 'Negatif'
  if (sentiment === 'neutral') return 'Nötr'
  return 'Belirsiz'
}

export function getDisplayStatusLabel(status: string | null | undefined): string {
  if (status === 'active') return 'Aktif'
  if (status === 'ended') return 'Bitmiş'
  if (status === 'passive') return 'Pasif'
  if (status === 'changed') return 'Değişmiş'
  if (status === 'pending') return 'Beklemede'
  if (status === 'running') return 'Çalışıyor'
  if (status === 'completed') return 'Tamamlandı'
  if (status === 'failed') return 'Başarısız'
  return status || 'Belirsiz'
}

export function getCampaignTypeLabel(campaign: CampaignLike): string {
  const aiAnalysis = (campaign.metadata?.ai_analysis ?? {}) as Record<string, unknown>
  const rawType = (aiAnalysis.campaign_type as string | undefined) ?? campaign.category
  return getDisplayCategoryLabel(rawType)
}

export function getCampaignQualitySignals(campaign: CampaignLike): QualitySignal[] {
  const title = (campaign.title || '').trim().toLowerCase()
  const body = (campaign.body || '').toLowerCase()
  const resolvedStart = resolveCampaignDateDisplay(campaign.validFrom, campaign.validFromSource, campaign.body, 'start').value
  const resolvedEnd = resolveCampaignDateDisplay(campaign.validTo, campaign.validToSource, campaign.body, 'end').value
  const aiAnalysis = (campaign.metadata?.ai_analysis ?? {}) as Record<string, unknown>
  const hasAi = Boolean(
    campaign.aiSummary ||
      campaign.sentiment ||
      campaign.aiSentiment ||
      aiAnalysis.summary ||
      aiAnalysis.sentiment ||
      aiAnalysis.campaign_type
  )

  const signals: QualitySignal[] = []

  if (
    !title ||
    GENERIC_TITLES.has(title) ||
    title.includes('tarayıcı sürümü') ||
    body.includes('desteklenmemektedir') ||
    body.includes('güncel kampanya bulunmamaktadır')
  ) {
    signals.push({
      code: 'suspicious',
      label: 'Şüpheli kayıt',
      variant: 'warning',
      icon: AlertTriangle,
    })
  }

  if (!resolvedStart || !resolvedEnd) {
    signals.push({
      code: 'missing_dates',
      label: 'Tarih eksik',
      variant: 'info',
      icon: CalendarClock,
    })
  }

  if (!hasAi) {
    signals.push({
      code: 'ai_missing',
      label: 'AI eksik',
      variant: 'info',
      icon: Brain,
    })
  }

  return signals
}
