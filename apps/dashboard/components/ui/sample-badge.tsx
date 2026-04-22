import * as React from 'react'
import { cn } from '@/lib/utils'
import { getSampleConfidence, getSampleConfidenceLabel } from '@/lib/sample-size'

interface SampleBadgeProps {
  /** Örneklem büyüklüğü (kampanya/gözlem sayısı). */
  n: number
  /** İsteğe bağlı ek class. */
  className?: string
  /** `compact=true` ise sadece "n=X" gösterir (tablo hücresi için). */
  compact?: boolean
}

/**
 * Wave 1 #1.3 — Örneklem güveni rozeti.
 *
 * `n < 5`  → turuncu "n=X düşük örneklem"
 * `n 5-15` → sarı "n=X orta örneklem"
 * `n > 15` → render etmez (yüksek güvende rozet gerekmez)
 *
 * Hücre içi çok yer kaplamaması için `compact` modu sadece "n=X" döner;
 * renk yine güven seviyesine göre kalır.
 */
export function SampleBadge({ n, className, compact = false }: SampleBadgeProps) {
  const safeN = Number.isFinite(n) && n >= 0 ? n : 0
  const level = getSampleConfidence(safeN)
  if (level === 'high') return null

  const colorClass =
    level === 'low'
      ? 'bg-orange-100 text-orange-700 border border-orange-200'
      : 'bg-amber-50 text-amber-700 border border-amber-200'

  const tooltipText = `n=${safeN} (${getSampleConfidenceLabel(level)})`

  return (
    <span
      title={tooltipText}
      aria-label={tooltipText}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none',
        colorClass,
        className
      )}
    >
      {compact ? `n=${safeN}` : `n=${safeN} ${getSampleConfidenceLabel(level)}`}
    </span>
  )
}

export default SampleBadge
