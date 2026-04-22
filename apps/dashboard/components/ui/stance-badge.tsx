'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Migration 020 — `sites.stance` (Atak/Defans) badge.
 *
 * Stance, scraper'ın `competitive-stance-calc.ts` job'u tarafından 24 saatte
 * bir hesaplanır. Velocity delta = `last_7d_count - last_4w_avg` ile
 * etiketlenir:
 *   - aggressive  velocity_delta >  +2  (kırmızı, ↑ +N cmp)
 *   - neutral     -2 <= delta <= +2     (gri,    = 0 cmp)
 *   - defensive   delta < -2            (mavi,   ↓ -N cmp)
 *   - unknown     henüz hesaplanmadı    (gri, no delta)
 *
 * Tooltip'te detay (last_7d, 4w_avg, bonus delta) gösterilir; ham veriler
 * caller tarafından `tooltip` prop'u ile geçirilir (API her sayfada farklı
 * detay verebilir, badge bunu pas geçer).
 */

export type SiteStance = 'aggressive' | 'neutral' | 'defensive' | 'unknown'

export interface StanceBadgeProps {
  stance: string | null | undefined
  velocityDelta: number | null | undefined
  className?: string
  /**
   * Native HTML `title` tooltip içeriği. UI tarafları (örn. competition page)
   * kendi context'lerine göre detay yazısı oluşturup geçer; badge sadece
   * gösterir. Boş bırakılırsa sade default açıklama gösterilir.
   */
  tooltip?: string
}

const STANCE_LABELS: Record<SiteStance, string> = {
  aggressive: 'Atak',
  neutral: 'Nötr',
  defensive: 'Defans',
  unknown: 'Belirsiz',
}

const STANCE_STYLES: Record<SiteStance, string> = {
  // Kırmızı tonu — agresif kampanya artışı.
  aggressive: 'bg-red-100 text-red-800 border-red-200',
  // Gri — değişim yok.
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
  // Mavi — defans / yavaşlama.
  defensive: 'bg-blue-100 text-blue-800 border-blue-200',
  // Soluk gri — henüz hesaplanmadı / veri yetersiz.
  unknown: 'bg-slate-50 text-slate-500 border-slate-200',
}

function normalizeStance(value: string | null | undefined): SiteStance {
  if (value === 'aggressive' || value === 'neutral' || value === 'defensive' || value === 'unknown') {
    return value
  }
  return 'unknown'
}

/**
 * Velocity delta'yı "+5 cmp" / "= 0 cmp" / "-3 cmp" formatına çevirir.
 * AGGRESSIVE → "↑ +5 cmp", NEUTRAL → "= 0 cmp", DEFENSIVE → "↓ -3 cmp".
 */
function formatDelta(stance: SiteStance, delta: number): string {
  if (stance === 'aggressive') return `+${delta} cmp`
  if (stance === 'defensive') return `${delta} cmp` // delta zaten negatif
  if (stance === 'neutral') {
    if (delta > 0) return `+${delta} cmp`
    if (delta < 0) return `${delta} cmp`
    return '0 cmp'
  }
  return '—'
}

const ICONS: Record<SiteStance, React.ComponentType<{ className?: string }>> = {
  aggressive: ArrowUp,
  neutral: Minus,
  defensive: ArrowDown,
  unknown: Minus,
}

export function StanceBadge({
  stance,
  velocityDelta,
  className,
  tooltip,
}: StanceBadgeProps) {
  const normalized = normalizeStance(stance)
  const delta = typeof velocityDelta === 'number' && Number.isFinite(velocityDelta)
    ? Math.trunc(velocityDelta)
    : 0
  const Icon = ICONS[normalized]
  const label = STANCE_LABELS[normalized]
  const style = STANCE_STYLES[normalized]

  // Tooltip'in default'u — sayfalar kendi detayını geçtiğinde bu override
  // edilir. unknown durumunda değer yerine açıklama gösterilir.
  const defaultTooltip =
    normalized === 'unknown'
      ? 'Tutum henüz hesaplanmadı (24 saat içinde)'
      : `${label}: son 7 gün - 4 haftalık ortalama = ${delta > 0 ? '+' : ''}${delta} kampanya`
  const titleAttr = tooltip || defaultTooltip

  return (
    <span
      title={titleAttr}
      aria-label={`${label} ${formatDelta(normalized, delta)}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        style,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
      {normalized !== 'unknown' && (
        <span className="font-mono text-[11px] opacity-80">
          {formatDelta(normalized, delta)}
        </span>
      )}
    </span>
  )
}

/**
 * Helper: API'den gelen ham alanlardan tooltip metni üretir. Site profili ve
 * competition page bunu `<StanceBadge tooltip={...} />` ile kullanır.
 *
 * Yalnızca elimizdeki alanları gösterir; bonus delta API'den gelmiyorsa
 * stance_score ham değerini "skor" olarak gösteririz (caller karar verir).
 */
export function formatStanceTooltip(input: {
  stance: string | null | undefined
  velocityDelta: number | null | undefined
  stanceScore?: number | null
  last7dCount?: number | null
  last4wAvg?: number | null
  bonusDeltaPct?: number | null
  updatedAt?: string | Date | null
}): string {
  const stance = normalizeStance(input.stance)
  const lines: string[] = []

  lines.push(`Tutum: ${STANCE_LABELS[stance]}`)
  if (typeof input.velocityDelta === 'number') {
    lines.push(
      `Velocity: ${input.velocityDelta > 0 ? '+' : ''}${input.velocityDelta} kampanya / hafta`
    )
  }
  if (typeof input.last7dCount === 'number') {
    lines.push(`Son 7 gün: ${input.last7dCount} kampanya`)
  }
  if (typeof input.last4wAvg === 'number') {
    lines.push(`4 hf. ortalaması: ${input.last4wAvg.toFixed(1)} kampanya/hf`)
  }
  if (typeof input.bonusDeltaPct === 'number') {
    const sign = input.bonusDeltaPct > 0 ? '+' : ''
    lines.push(`Ort. bonus 7g/28g: ${sign}${(input.bonusDeltaPct * 100).toFixed(0)}%`)
  }
  if (typeof input.stanceScore === 'number') {
    lines.push(`Skor: ${input.stanceScore.toFixed(2)}`)
  }
  if (input.updatedAt) {
    const d = input.updatedAt instanceof Date ? input.updatedAt : new Date(input.updatedAt)
    if (!Number.isNaN(d.getTime())) {
      lines.push(`Güncellendi: ${d.toLocaleString('tr-TR')}`)
    }
  }

  return lines.join('\n')
}
