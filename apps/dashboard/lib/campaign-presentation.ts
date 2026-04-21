import { AlertTriangle, CalendarClock, Brain, Tag, GaugeCircle, type LucideIcon } from 'lucide-react'
import { getCategoryLabel } from '@/lib/category-labels'
import { resolveCampaignDateDisplay } from '@/lib/campaign-dates'

type CampaignLike = {
  title?: string | null
  body?: string | null
  validFrom?: string | null
  validTo?: string | null
  validFromSource?: string | null
  validToSource?: string | null
  validFromConfidence?: number | null
  validToConfidence?: number | null
  category?: string | null
  sentiment?: string | null
  aiSentiment?: string | null
  aiSummary?: string | null
  metadata?: Record<string, unknown> | null
}

export type QualitySignal = {
  code: 'suspicious' | 'missing_dates' | 'ai_missing' | 'missing_extracted_tags' | 'low_confidence'
  label: string
  variant: 'warning' | 'info'
  icon: LucideIcon
}

export type CampaignBonusInfo = {
  amount: number | null
  percentage: number | null
  minDeposit: number | null
  maxBonus: number | null
  freeBetAmount: number | null
  /** AI confidence for the campaign type / extracted tags (0-1). */
  confidence: number | null
  /** Pre-formatted display string e.g. "₺1.000", "%50", "₺1.000 (%50)" or null when no signal. */
  display: string | null
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
  // Scraper schema writes 'expired' / 'hidden'; legacy UI used 'ended' /
  // 'passive'. Map both to the Turkish label so the campaigns table doesn't
  // surface raw enum values when the bulk recalc job marks a campaign ended.
  if (status === 'expired' || status === 'ended') return 'Bitmiş'
  if (status === 'hidden' || status === 'passive') return 'Pasif'
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

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(',', '.')
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function formatCurrency(value: number): string {
  // ₺1.000 formatting; tr-TR uses '.' for thousands and ',' for decimals.
  if (Number.isInteger(value)) {
    return `₺${value.toLocaleString('tr-TR')}`
  }
  return `₺${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`
}

function formatPercentage(value: number): string {
  if (Number.isInteger(value)) return `%${value}`
  return `%${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`
}

export function getCampaignBonusInfo(campaign: CampaignLike): CampaignBonusInfo {
  const aiAnalysis = (campaign.metadata?.ai_analysis ?? {}) as Record<string, unknown>
  const tags = (aiAnalysis.extractedTags ?? {}) as Record<string, unknown>
  const conditions = (aiAnalysis.conditions ?? {}) as Record<string, unknown>

  const amount = toFiniteNumber(tags.bonus_amount)
  const percentage = toFiniteNumber(tags.bonus_percentage)
  const minDeposit =
    toFiniteNumber(tags.min_deposit) ?? toFiniteNumber(conditions.min_deposit)
  const maxBonus =
    toFiniteNumber(tags.max_bonus) ?? toFiniteNumber(conditions.max_bonus)
  const freeBetAmount =
    toFiniteNumber(tags.free_bet_amount) ?? toFiniteNumber(tags.freebet_amount)

  const confidence =
    toFiniteNumber(aiAnalysis.type_confidence) ??
    toFiniteNumber(aiAnalysis.confidence) ??
    toFiniteNumber(aiAnalysis.category_confidence)

  let display: string | null = null
  if (amount !== null && percentage !== null) {
    display = `${formatCurrency(amount)} (${formatPercentage(percentage)})`
  } else if (amount !== null) {
    display = formatCurrency(amount)
  } else if (percentage !== null) {
    display = formatPercentage(percentage)
  } else if (freeBetAmount !== null) {
    display = `${formatCurrency(freeBetAmount)} freebet`
  }

  return {
    amount,
    percentage,
    minDeposit,
    maxBonus,
    freeBetAmount,
    confidence,
    display,
  }
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

  // New: bonus_amount / bonus_percentage çıkarılamadıysa
  const bonusInfo = getCampaignBonusInfo(campaign)
  if (hasAi && bonusInfo.amount === null && bonusInfo.percentage === null) {
    signals.push({
      code: 'missing_extracted_tags',
      label: 'Bonus etiketi eksik',
      variant: 'info',
      icon: Tag,
    })
  }

  // New: tarih güveni düşük (validFromConfidence < 0.5)
  const fromConf = typeof campaign.validFromConfidence === 'number' ? campaign.validFromConfidence : null
  const toConf = typeof campaign.validToConfidence === 'number' ? campaign.validToConfidence : null
  const lowFrom = fromConf !== null && fromConf < 0.5
  const lowTo = toConf !== null && toConf < 0.5
  if (lowFrom || lowTo) {
    signals.push({
      code: 'low_confidence',
      label: 'Düşük güven',
      variant: 'warning',
      icon: GaugeCircle,
    })
  }

  return signals
}
