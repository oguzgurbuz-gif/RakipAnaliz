/**
 * FE-7 — Hızlı tarih chip'leri için ortak util.
 *
 * Mevcut `lib/date-range/presets.ts` zaten preset hesaplamalarını yapıyor;
 * bu modül o util'leri tek bir "quick range" sözleşmesi etrafında re-export
 * eder ve UI tarafının daha az dosya zincirlemesi yapmasını sağlar.
 *
 * Tasarım kararı:
 *   - Yeni preset eklerken `lib/date-range/presets.ts` tek kaynak.
 *   - "Quick chip" UI bu modül üzerinden import etsin (chip listesi +
 *     label sözlüğü tek noktada).
 *   - URL persistence Batch A'nın `lib/url/params.ts` katmanından
 *     yararlanır; `dm` (dateMode), `from`, `to`, `preset` param'ları
 *     kullanılır. dateMode burada quick-range ile bağımsız (kampanyaların
 *     hangi tarihinin filtrelendiği), ama short-form yazımı için aynı
 *     sözleşmeyi takip eder.
 */

import {
  getPresetRange,
  detectPreset,
  PRESET_LABELS,
  PRESET_ORDER,
  toIsoDate,
  type DateRange,
  type DateRangePresetKey,
} from '@/lib/date-range/presets'

export {
  getPresetRange,
  detectPreset,
  PRESET_LABELS,
  PRESET_ORDER,
  toIsoDate,
  type DateRange,
  type DateRangePresetKey,
}

/**
 * "Hızlı chip" listesi — UI'da göstermek istediğimiz preset'ler.
 * Sırayla: Bu Hafta, Bu Ay, Son 7 Gün, Son 30 Gün. (Bugün de mevcut
 * altyapıda var; ihtiyaç olursa buraya ekle.)
 */
export const QUICK_RANGE_CHIPS: ReadonlyArray<{
  key: Exclude<DateRangePresetKey, 'custom'>
  label: string
}> = [
  { key: 'thisWeek', label: PRESET_LABELS.thisWeek },
  { key: 'thisMonth', label: PRESET_LABELS.thisMonth },
  { key: 'last7d', label: PRESET_LABELS.last7d },
  { key: 'last30d', label: PRESET_LABELS.last30d },
]

/**
 * Verilen chip key'i için anlık {from, to} hesapla. UI tıklamasında
 * bunu kullanıp DateRangeProvider.applyPreset(key) çağırmak yerine
 * sadece range'i alıp setRange(from, to) etmek de geçerli (preset
 * detection otomatik).
 */
export function rangeForChip(
  key: Exclude<DateRangePresetKey, 'custom'>,
  now: Date = new Date()
): DateRange {
  return getPresetRange(key, now)
}

/**
 * Verilen aralığın hangi chip'e karşılık geldiğini bulur. Eşleşme
 * yoksa null döner (custom range). UI'da aktif chip highlight için
 * kullan: `chipKey === activeChip(from, to)`.
 */
export function activeChip(
  from: string,
  to: string,
  now: Date = new Date()
): Exclude<DateRangePresetKey, 'custom'> | null {
  const detected = detectPreset(from, to, now)
  if (detected === 'custom') return null
  return detected
}
