/**
 * FE-3 — Filtre/sıralama dropdown'larında görünen teknik field isimlerinin
 * Türkçe karşılıkları. Tek kaynak — yeni dropdown eklenirse buradan beslensin.
 */

/** Sıralama (sort) alanları için Türkçe etiketler. */
export const SORT_FIELD_LABELS: Record<string, string> = {
  last_seen_at: 'Son Görülme',
  first_seen_at: 'İlk Görülme',
  created_at: 'Oluşturulma',
  updated_at: 'Güncellenme',
  valid_from: 'Başlangıç Tarihi',
  valid_to: 'Bitiş Tarihi',
  bonus_amount: 'Bonus Miktarı',
  duration: 'Kampanya Süresi',
  title: 'Başlık (A-Z)',
  status: 'Durum',
}

/** Filtre paneli üst başlıkları (URL paramı veya filtre key'i bazında). */
export const FILTER_FIELD_LABELS: Record<string, string> = {
  siteId: 'Site',
  site: 'Site',
  status: 'Durum',
  sentiment: 'Duygu',
  intent: 'Amaç',
  dateMode: 'Tarih Modu',
  campaignType: 'Kampanya Tipi',
  campaign_type: 'Kampanya Tipi',
  category: 'Kategori',
  search: 'Arama',
  sort: 'Sıralama',
  dateCompleteness: 'Tarih Durumu',
  dateFrom: 'Başlangıç',
  dateTo: 'Bitiş',
}

/** Sıralama opsiyonu (asc/desc varyantlı) etiket üretici. */
export function getSortOptionLabel(value: string): string {
  if (!value) return 'Varsayılan'
  const desc = value.startsWith('-')
  const field = desc ? value.slice(1) : value
  const base = SORT_FIELD_LABELS[field] ?? field
  return desc ? `${base} (azalan)` : base
}

/** Filtre alanı için Türkçe etiket; tanımlı değilse `key` döner. */
export function getFilterFieldLabel(key: string): string {
  return FILTER_FIELD_LABELS[key] ?? key
}
