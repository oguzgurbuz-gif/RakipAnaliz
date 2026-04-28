/**
 * FE-8 — Para birimi formatlama yardımcıları.
 *
 * Tek kaynak; tüm dashboard widget'ları (ComparisonBar / Pazar Hakimiyeti /
 * InsightCard / SiteCard / tablolar) buradan tüketmeli ki TL gösterimi tek tip
 * kalsın. Önceden her bileşen kendi `₺${value}` formatını yazıyor, bu da
 * yuvarlama, binlik ayraç ve K/M kısaltma davranışlarında tutarsızlığa neden
 * oluyordu (ör. ShareOfVoice `₺1234567.toLocaleString()` (locale=en-US) ile
 * `1,234,567` üretirken CategoryWinner aynı sayıyı `1.234.567` üretiyordu).
 *
 * Tüm format'lar `tr-TR` locale'i kullanır (binlik için `.`, ondalık için `,`).
 */

const CURRENCY_FORMATTER = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 0,
})

const NUMBER_FORMATTER_TR = new Intl.NumberFormat('tr-TR', {
  maximumFractionDigits: 0,
})

const COMPACT_DECIMAL_FORMATTER = new Intl.NumberFormat('tr-TR', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
})

/**
 * Tam TL gösterimi. Yuvarlanır (kuruş gösterilmez).
 *
 * Intl `currency` style varsayılan olarak Türkçe'de "₺1.234" üretir. Boş /
 * geçersiz girdiler boş string yerine `—` döner ki tablolarda hücre boş
 * görünmesin.
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  // Intl'nin "currency" style'ı tr-TR'de "₺1.234" formatı verir;
  // toLocaleString prefix'lerine güvenmek yerine merkezi formatter kullanırız.
  return CURRENCY_FORMATTER.format(Math.round(value))
}

/**
 * Kısa TL gösterimi. Bar/grafik etiketi gibi dar yerler için.
 * - >= 1.000.000 → ₺1,2M
 * - >= 1.000     → ₺1,5K
 * - <  1.000     → ₺850
 *
 * Format kısaltma soneki (`K`, `M`) tr-TR locale'inde de İngilizce kalır
 * (yaygın kullanım); base sayı tr-TR ondalık ayracıyla format'lanır.
 */
export function formatCurrencyCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  const v = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (v >= 1_000_000) {
    return `${sign}₺${COMPACT_DECIMAL_FORMATTER.format(v / 1_000_000)}M`
  }
  if (v >= 1_000) {
    return `${sign}₺${COMPACT_DECIMAL_FORMATTER.format(v / 1_000)}K`
  }
  return `${sign}₺${NUMBER_FORMATTER_TR.format(Math.round(v))}`
}

/**
 * Tam sayı / kampanya sayısı gibi non-currency değerler için tr-TR binlik
 * ayraçlı format. Negatif/0/NaN korumalı.
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return NUMBER_FORMATTER_TR.format(Math.round(value))
}
