import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  getCampaignBonusInfo,
  formatTurnover,
  formatMinDeposit,
  formatEffectiveBonus,
} from '@/lib/campaign-presentation'

type CampaignLike = {
  // BonusChips yalnızca metadata.ai_analysis.extractedTags / conditions
  // içine bakar; başka alanlara dokunmaz, bu yüzden geniş tutuluyor.
  metadata?: Record<string, unknown> | null
}

interface BonusChipsProps {
  campaign: CampaignLike
  /** compact mode: tek satır, küçük font, dar padding (tablo hücresi için). */
  compact?: boolean
  /** Effective bonus chip'ini göster. Detay sayfası ve "best deals"
   *  kartlarında true; tabloda compact için genelde false. */
  showEffective?: boolean
  className?: string
}

/**
 * BonusChips — kampanya bonus alanlarını renkli chip'ler halinde render eder.
 *
 * Renk kodu (terminal/neon temalı):
 *   - Bonus tutarı: mavi
 *   - Yüzde: mor
 *   - Min deposit: gri
 *   - Turnover: turuncu (>= 20x ise kırmızı uyarı)
 *   - Effective: yeşil (küçük, tooltip ile "çevrim sonrası tahmin")
 *   - Free bet: cyan
 *
 * Hiçbir alan yoksa "veri yok" rozet (sample-badge mantığı, compact stil).
 */
export function BonusChips({
  campaign,
  compact = false,
  showEffective = true,
  className,
}: BonusChipsProps) {
  const info = getCampaignBonusInfo(campaign as Parameters<typeof getCampaignBonusInfo>[0])

  const turnoverLabel = formatTurnover(info.turnoverMultiplier)
  const minDepositLabel = formatMinDeposit(info.minDeposit)
  const effectiveLabel = showEffective
    ? formatEffectiveBonus(info.amount, info.turnoverMultiplier)
    : null

  // Görüntülenecek herhangi bir veri yok mu? Bonus tutarı YA da yüzde varsa
  // chip render edilir; ikisi de yoksa "veri yok" rozeti.
  const hasAnySignal =
    info.amount !== null ||
    info.percentage !== null ||
    info.freeBetAmount !== null ||
    minDepositLabel !== null ||
    turnoverLabel !== null

  if (!hasAnySignal) {
    return (
      <span
        title="Bonus etiketi henüz çıkarılamadı"
        aria-label="Bonus etiketi yok"
        className={cn(
          'inline-flex items-center gap-1 rounded border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground',
          className
        )}
      >
        veri yok
      </span>
    )
  }

  const chipBase = compact
    ? 'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none whitespace-nowrap border'
    : 'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold leading-tight whitespace-nowrap border'

  // Çevrim büyükse (≥ 20x) uyarı rengi — kullanıcının "yüksek çevrim" risk
  // sinyali olarak görmesi için.
  const highTurnover =
    info.turnoverMultiplier !== null && info.turnoverMultiplier >= 20
  const turnoverColor = highTurnover
    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900'
    : 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900'

  return (
    <div
      className={cn(
        'inline-flex flex-wrap items-center',
        compact ? 'gap-1' : 'gap-1.5',
        className
      )}
    >
      {/* Bonus amount — mavi */}
      {info.amount !== null && info.amount > 0 && (
        <span
          className={cn(
            chipBase,
            'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900'
          )}
        >
          ₺{Math.round(info.amount).toLocaleString('tr-TR')}
        </span>
      )}

      {/* Percentage — mor */}
      {info.percentage !== null && info.percentage > 0 && (
        <span
          className={cn(
            chipBase,
            'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900'
          )}
        >
          %{info.percentage}
        </span>
      )}

      {/* Free bet — cyan (sadece bonus_amount yoksa kafa karıştırmaz) */}
      {info.freeBetAmount !== null && info.freeBetAmount > 0 && info.amount === null && (
        <span
          className={cn(
            chipBase,
            'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900'
          )}
        >
          ₺{Math.round(info.freeBetAmount).toLocaleString('tr-TR')} freebet
        </span>
      )}

      {/* Min deposit — gri */}
      {minDepositLabel && (
        <span
          className={cn(
            chipBase,
            'bg-muted text-muted-foreground border-border'
          )}
        >
          {minDepositLabel}
        </span>
      )}

      {/* Turnover — turuncu / kırmızı */}
      {turnoverLabel && (
        <span
          title={highTurnover ? 'Yüksek çevrim şartı' : 'Çevrim şartı'}
          className={cn(chipBase, turnoverColor)}
        >
          {turnoverLabel} çevrim
        </span>
      )}

      {/* Effective bonus — yeşil, küçük, tooltip ile açıklama */}
      {effectiveLabel && (
        <span
          title={
            info.turnoverMultiplier !== null
              ? `Çevrim sonrası tahmin: ${info.amount} TL / ${info.turnoverMultiplier}x`
              : 'Çevrim verisi olmadığı için raw bonus gösteriliyor'
          }
          className={cn(
            chipBase,
            'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
          )}
        >
          {effectiveLabel}
        </span>
      )}
    </div>
  )
}

export default BonusChips
