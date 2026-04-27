/**
 * FE-1 — Kampanya status değerleri için merkezi Türkçe etiket eşleme.
 *
 * Kanonik 4 state (scraper schema): active / expired / hidden / pending.
 * Legacy değerler (ended / passive) hâlâ bazı eski satırlarda görülebileceği
 * için backward-compatible biçimde aynı Türkçe çıktıya map'leniyor.
 *
 * Tek kaynak — tüm dropdown / badge / filtre yerleri buradan beslensin,
 * inline `{ active: 'Aktif' }` map'leri açıp duplikasyon üretmeyelim.
 */
export const STATUS_LABELS: Record<string, string> = {
  active: 'Aktif',
  ended: 'Sona Ermiş',
  expired: 'Sona Ermiş',
  passive: 'Pasif',
  hidden: 'Pasif',
  pending: 'Beklemede',
  changed: 'Değişmiş',
  running: 'Çalışıyor',
  completed: 'Tamamlandı',
  failed: 'Başarısız',
}

/** Bilinmeyen değerlerde girdi olduğu gibi geri döner (debug için yararlı). */
export function getStatusLabel(status: string | null | undefined): string {
  if (!status) return ''
  return STATUS_LABELS[status] ?? status
}

/**
 * Filtre dropdown'ları için kanonik 4 state (UI'da göstermek istediğimiz set).
 * Legacy değerler yazma için kullanılmıyor, yalnızca okuma/render tarafında
 * `STATUS_LABELS` üzerinden çevriliyor.
 */
export const CANONICAL_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'active', label: STATUS_LABELS.active },
  { value: 'expired', label: STATUS_LABELS.expired },
  { value: 'hidden', label: STATUS_LABELS.hidden },
  { value: 'pending', label: STATUS_LABELS.pending },
]
